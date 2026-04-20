import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  Query,
  ForbiddenException,
  Delete,
  Patch,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { UserGuard } from 'src/security/guards/auth.guard';
import { ApplicationService } from '../service/application.service';
import { OpenAIService } from '../service/openai.service';
import { PdfService } from '../service/pdf.service';
import { ProfileService } from 'src/user/service/profile.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApplicationResponseDto,
  GenerateCvDto,
  UpdateApplicationDto,
  UpdateStatusDto,
} from '../dto/application.dto';
import { PaymentService } from 'src/payment/service/payment.service';
import { JdMatchingService } from '../service/Jdmatching.service';

@ApiTags('Job Application')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('application')
export class ApplicationController {
  constructor(
    private appService: ApplicationService,
    private aiService: OpenAIService,
    private pdfService: PdfService,
    private profileService: ProfileService,
    private paymentService: PaymentService,
    private matchingService: JdMatchingService,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: 'Process JD and generate tailored CV/Cover Letter' })
  @ApiBody({ type: GenerateCvDto })
  @ApiResponse({
    status: 200,
    description: 'CV generated or existing one found.',
    type: ApplicationResponseDto,
  })
  async generate(@Req() req, @Body() jobData: GenerateCvDto) {
    const userId = req.user._id;

    // Check for duplicates
    const check = await this.appService.processJobApplication(userId, jobData);
    if (check.isDuplicate) return check;
    const { jdHash } = check as { isDuplicate: false; jdHash: string };

    // Pattern-match against existing applications
    const remixResult = await this.matchingService.findOrRemix(
      userId,
      jobData.title,
      jobData.company,
      jobData.description,
    );

    let aiOutput: any;
    let usedCache = false;

    if (remixResult.usedCache) {
      aiOutput = {
        ...remixResult.data,
        coverLetter: await this.buildCoverLetter(
          remixResult.data,
          jobData,
          userId,
        ),
      };
      usedCache = true;
    } else {
      // No good match, fetch profile and call OpenAI as normal.
      const profile = await this.profileService.getProfile(userId);
      aiOutput = await this.aiService.generateTailoredContent(
        profile,
        jobData.description,
      );
    }

    // Save and return
    const savedApp = await this.appService.saveApplication({
      user: userId,
      rawJobDescription: jobData.description,
      companyName: jobData.company,
      jobTitle: jobData.title,
      jdHash: jdHash,
      generatedCvData: aiOutput,
      generatedCoverLetter: aiOutput.coverLetter,
      // Store metadata so you can audit cache hit rates in the DB
      cacheMetadata: {
        usedCache,
        confidence: remixResult.confidence,
        matchedKeywords: remixResult.matchedKeywords,
      },
    });

    // Only charge credits and log a transaction for genuine AI calls
    await this.paymentService.createTransaction(userId, jobData.company);

    return savedApp;
  }

  @Get()
  @ApiOperation({
    summary: 'Get all job applications for the logged-in user with pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Req() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const userId = req.user._id;
    return this.appService.getUserApplications(userId, page, limit);
  }

  @Get('download/:id')
  @ApiOperation({ summary: 'Stream the generated CV as a PDF file' })
  @ApiParam({ name: 'id', description: 'The Application History ID' })
  @ApiQuery({
    name: 'template',
    required: false,
    description:
      'Resume template style. One of: modern | corporate | minimal | editorial | executive',
    example: 'modern',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    description: 'The CV PDF file.',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  async download(
    @Req() req,
    @Param('id') appId: string,
    @Query('template') template: string,
    @Res() res: Response,
  ) {
    const [app, profile] = await Promise.all([
      this.appService.getById(appId),
      this.profileService.getProfile(req.user._id),
    ]);

    const buffer = await this.pdfService.generateCvPdf(
      app.generatedCvData,
      profile,
      template || 'modern',
    );

    const filename = `Resume_${(app.companyName || 'Application').replace(/\s+/g, '_')}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('download-cover-letter/:id')
  @ApiOperation({ summary: 'Stream the generated cover letter as a PDF file' })
  @ApiParam({ name: 'id', description: 'The Application ID' })
  @ApiProduces('application/pdf')
  @ApiResponse({
    status: 200,
    description: 'The cover letter PDF file.',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  async downloadCoverLetter(
    @Req() req,
    @Param('id') appId: string,
    @Res() res: Response,
  ) {
    const [app, profile] = await Promise.all([
      this.appService.getById(appId),
      this.profileService.getProfile(req.user._id),
    ]);

    const buffer = await this.pdfService.generateCoverLetterPdf(
      app.generatedCoverLetter,
      profile,
      app.companyName,
      app.jobTitle,
    );

    const filename = `CoverLetter_${(app.companyName || 'Application').replace(/\s+/g, '_')}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update the recruitment status of an application' })
  @ApiParam({
    name: 'id',
    description: 'The unique MongoDB ID of the application',
    example: '658af3...',
  })
  @ApiBody({ type: UpdateStatusDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The application status has been successfully updated.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No application found with the provided ID.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid status value provided.',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.appService.updateStatus(id, updateStatusDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single application by ID' })
  async findOne(@Req() req, @Param('id') id: string) {
    const userId = req.user._id;
    const application = await this.appService.getById(id);

    // Ensure the application belongs to the logged-in user
    if (application.user.toString() !== userId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to view this application',
      );
    }

    return application;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update application details',
    description:
      'Updates specific fields of an application record. Only the owner of the record can perform this action.',
  })
  @ApiParam({
    name: 'id',
    description: 'The unique MongoDB ID of the application record',
  })
  @ApiResponse({
    status: 200,
    description: 'The application has been successfully updated.',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: You do not own this record.',
  })
  @ApiResponse({ status: 404, description: 'Application not found.' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateApplicationDto,
    @Req() req,
  ) {
    const userId = req.user._id;
    return this.appService.updateApplication(id, userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete an application record' })
  @ApiParam({ name: 'id', description: 'The Application ID' })
  async remove(@Req() req, @Param('id') id: string) {
    const userId = req.user._id;
    await this.appService.deleteApplication(id, userId);

    return {
      message: 'Application successfully deleted',
      deletedId: id,
    };
  }

  private async buildCoverLetter(
    cvData: any,
    jobData: { title: string; company: string; description: string },
    userId: string,
  ): Promise<string> {
    // Grab the most recent application that has a cover letter
    const recent = await this.appService.getMostRecentWithCoverLetter(userId);

    if (!recent?.generatedCoverLetter) {
      return this.templateCoverLetter(cvData, jobData);
    }

    // Swap old company/title references for new ones
    let letter = recent.generatedCoverLetter;
    if (recent.companyName) {
      letter = letter.replace(
        new RegExp(recent.companyName, 'gi'),
        jobData.company,
      );
    }
    if (recent.jobTitle) {
      letter = letter.replace(new RegExp(recent.jobTitle, 'gi'), jobData.title);
    }

    return letter;
  }

  /** Minimal template-based cover letter used only as a last resort fallback. */
  private templateCoverLetter(
    cvData: any,
    jobData: { title: string; company: string },
  ): string {
    const topSkills = (cvData.relevantSkills ?? []).slice(0, 4).join(', ');
    const latestRole = cvData.refinedExperience?.[0];

    return [
      `Dear Hiring Manager,`,
      ``,
      `I am writing to express my strong interest in the ${jobData.title} position at ${jobData.company}.`,
      ``,
      latestRole
        ? `Most recently, I served as ${latestRole.role} at ${latestRole.company}, where I ${latestRole.highlights?.[0]?.toLowerCase() ?? 'delivered impactful results'}.`
        : '',
      ``,
      `My core expertise spans ${topSkills}, which aligns directly with the requirements of this role.`,
      ``,
      `I am excited about the opportunity to bring this experience to ${jobData.company} and would welcome the chance to discuss how I can contribute to your team.`,
      ``,
      `Warm regards,`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');
  }
}
