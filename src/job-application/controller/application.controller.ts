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
  NotFoundException,
} from '@nestjs/common';
import { Response, Request } from 'express';
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
  GenerateEmailDto,
  GenerateProposalDto,
  RegenerateProposalDto,
  UpdateApplicationDto,
  UpdateStatusDto,
} from '../dto/application.dto';
import { PaymentService } from 'src/payment/service/payment.service';
import { JdMatchingService } from '../service/Jdmatching.service';
import { SignedDownloadService } from 'src/security/services/signed-download.service';
import { Public } from 'src/security/guards/public.decorator';

@ApiTags('Job Application')
@Controller('application')
export class ApplicationController {
  constructor(
    private appService: ApplicationService,
    private aiService: OpenAIService,
    private pdfService: PdfService,
    private profileService: ProfileService,
    private paymentService: PaymentService,
    private matchingService: JdMatchingService,
    private signedDownload: SignedDownloadService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(UserGuard)
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

    const check = await this.appService.processJobApplication(userId, jobData);
    if (check.isDuplicate) return check;
    const { jdHash } = check as { isDuplicate: false; jdHash: string };

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
      const profile = await this.profileService.getProfile(userId);
      aiOutput = await this.aiService.generateTailoredContent(
        profile,
        jobData.description,
      );
    }

    const savedApp = await this.appService.saveApplication({
      user: userId,
      rawJobDescription: jobData.description,
      companyName: jobData.company,
      jobTitle: jobData.title,
      jdHash: jdHash,
      generatedCvData: aiOutput,
      generatedCoverLetter: aiOutput.coverLetter,
      cacheMetadata: {
        usedCache,
        confidence: remixResult.confidence,
        matchedKeywords: remixResult.matchedKeywords,
      },
    });

    if (jobData.generateEmail && jobData.emailTone) {
      try {
        const profile = await this.profileService.getProfile(userId);
        const emailOutput = await this.aiService.generateEmail(
          profile,
          jobData.description,
          {
            tone: jobData.emailTone,
            deliverableType: 'resume',
            companyName: jobData.company,
          },
        );
        (savedApp as any).generatedEmail = emailOutput.body;
        (savedApp as any).emailMetadata = {
          tone: emailOutput.tone,
          subject: emailOutput.subject,
          deliverableType: 'resume',
          wordCount: emailOutput.wordCount,
        };
        (savedApp as any).lastEmailGeneratedAt = new Date();
        await savedApp.save();
        await this.paymentService.createTransaction(
          userId,
          jobData.company,
          'email',
        );
      } catch (err) {
        // Email is a non-blocking add-on. If it fails, we log the error but don't fail the whole request.
      }
    }

    await this.paymentService.createTransaction(userId, jobData.company);
    return savedApp;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Get()
  @ApiOperation({
    summary: 'Get all job applications for the logged-in user',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Req() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.appService.getUserApplications(req.user._id, page, limit);
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Post('generate-proposal')
  @ApiOperation({
    summary:
      'Generate a tailored Upwork-style proposal for a job. Creates a new ' +
      'application record with the proposal attached.',
  })
  @ApiBody({ type: GenerateProposalDto })
  async generateProposal(@Req() req, @Body() jobData: GenerateProposalDto) {
    const userId = req.user._id;

    const check = await this.appService.processJobApplication(userId, jobData);

    if (check.isDuplicate) {
      const existing = check.data as any;
      if (existing.generatedProposal) {
        return existing;
      }
      // Generate proposal and attach
      const profile = await this.profileService.getProfile(userId);
      const aiOutput = await this.aiService.generateProposal(
        profile,
        jobData.description,
      );
      existing.generatedProposal = aiOutput.proposal;
      existing.proposalMetadata = aiOutput.metadata;
      existing.lastProposalGeneratedAt = new Date();
      await existing.save();
      await this.paymentService.createTransaction(
        userId,
        jobData.company,
        'proposal',
      );
      return existing;
    }

    // Fresh application
    const { jdHash } = check as { isDuplicate: false; jdHash: string };
    const profile = await this.profileService.getProfile(userId);

    const aiOutput = await this.aiService.generateProposal(
      profile,
      jobData.description,
    );

    const saved = await this.appService.saveApplication({
      user: userId,
      rawJobDescription: jobData.description,
      companyName: jobData.company,
      jobTitle: jobData.title,
      jdHash,
      generatedProposal: aiOutput.proposal,
      proposalMetadata: aiOutput.metadata,
      lastProposalGeneratedAt: new Date(),
    });

    if (jobData.generateEmail && jobData.emailTone) {
      try {
        const profile = await this.profileService.getProfile(userId);
        const emailOutput = await this.aiService.generateEmail(
          profile,
          jobData.description,
          {
            tone: jobData.emailTone,
            deliverableType: 'proposal',
            companyName: jobData.company,
          },
        );
        // `savedApp` here is either `existing` or `saved` depending on the branch
        (saved as any).generatedEmail = emailOutput.body;
        (saved as any).emailMetadata = {
          tone: emailOutput.tone,
          subject: emailOutput.subject,
          deliverableType: 'proposal',
          wordCount: emailOutput.wordCount,
        };
        (saved as any).lastEmailGeneratedAt = new Date();
        await saved.save();
        await this.paymentService.createTransaction(
          userId,
          jobData.company,
          'email',
        );
      } catch (err) {
        // Email generation is a non-blocking add-on. If it fails, we log the error but don't fail the whole request.
      }
    }

    await this.paymentService.createTransaction(
      userId,
      jobData.company,
      'proposal',
    );
    return saved;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Get('download-link/:id')
  @ApiOperation({
    summary: 'Mint a short-lived signed download URL for the CV PDF',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  @ApiQuery({ name: 'template', required: false })
  async getCvDownloadLink(
    @Req() req,
    @Param('id') appId: string,
    @Query('template') template: string,
  ) {
    await this.assertOwnership(appId, req.user._id);
    const qs = this.signedDownload.sign({
      resourceId: appId,
      userId: String(req.user._id),
      scope: 'cv',
      ttlSeconds: 60,
    });
    const base = process.env.API_PUBLIC_URL ?? '';
    const tplParam = template
      ? `&template=${encodeURIComponent(template)}`
      : '';
    return {
      url: `${base}/api/v1/application/download/${appId}?${qs}${tplParam}`,
      expiresIn: 60,
    };
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Get('download-cover-letter-link/:id')
  @ApiOperation({
    summary: 'Mint a short-lived signed download URL for the cover letter',
  })
  @ApiParam({ name: 'id', description: 'Application ID' })
  async getCoverLetterDownloadLink(@Req() req, @Param('id') appId: string) {
    await this.assertOwnership(appId, req.user._id);
    const qs = this.signedDownload.sign({
      resourceId: appId,
      userId: String(req.user._id),
      scope: 'cover-letter',
      ttlSeconds: 60,
    });
    const base = process.env.API_PUBLIC_URL ?? '';
    return {
      url: `${base}/api/v1/application/download-cover-letter/${appId}?${qs}`,
      expiresIn: 60,
    };
  }

  @Public()
  @Get('download/:id')
  @ApiOperation({
    summary: 'Stream the generated CV as a PDF (requires signed query string)',
  })
  @ApiProduces('application/pdf')
  async download(
    @Param('id') appId: string,
    @Query('template') template: string,
    @Query('sig') sig: string,
    @Query('exp') exp: string,
    @Query('n') nonce: string,
    @Query('u') userId: string,
    @Res() res: Response,
  ) {
    const { userId: verifiedUserId } = this.signedDownload.verify({
      resourceId: appId,
      scope: 'cv',
      sig,
      exp,
      nonce,
      userId,
    });

    const [app, profile] = await Promise.all([
      this.appService.getById(appId),
      this.profileService.getProfile(verifiedUserId),
    ]);

    if (!app || String(app.user) !== String(verifiedUserId)) {
      throw new ForbiddenException();
    }

    const buffer = await this.pdfService.generateCvPdf(
      app.generatedCvData,
      profile,
      template || 'modern',
    );

    const filename = this.buildDownloadFilename(
      profile.fullName,
      app.jobTitle,
      'resume',
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store, private',
    });
    res.end(buffer);
  }

  @Public()
  @Get('download-cover-letter/:id')
  @ApiOperation({
    summary: 'Stream the cover letter as PDF (requires signed query string)',
  })
  @ApiProduces('application/pdf')
  async downloadCoverLetter(
    @Param('id') appId: string,
    @Query('sig') sig: string,
    @Query('exp') exp: string,
    @Query('n') nonce: string,
    @Query('u') userId: string,
    @Res() res: Response,
  ) {
    const { userId: verifiedUserId } = this.signedDownload.verify({
      resourceId: appId,
      scope: 'cover-letter',
      sig,
      exp,
      nonce,
      userId,
    });

    const [app, profile] = await Promise.all([
      this.appService.getById(appId),
      this.profileService.getProfile(verifiedUserId),
    ]);

    if (!app || String(app.user) !== String(verifiedUserId)) {
      throw new ForbiddenException();
    }

    const buffer = await this.pdfService.generateCoverLetterPdf(
      app.generatedCoverLetter,
      profile,
      app.companyName,
      app.jobTitle,
    );

    const filename = this.buildDownloadFilename(
      profile.fullName,
      app.jobTitle,
      'CoverLetter',
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store, private',
    });
    res.end(buffer);
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update the recruitment status of an application' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateStatusDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.appService.updateStatus(id, updateStatusDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Post(':id/add-proposal')
  @ApiOperation({
    summary:
      'Add a proposal to an existing application. Charges one usage credit.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: RegenerateProposalDto })
  async addProposal(
    @Req() req,
    @Param('id') id: string,
    @Body() body: RegenerateProposalDto,
  ) {
    const userId = req.user._id;
    const app = await this.appService.getById(id);
    if (app.user.toString() !== userId.toString()) {
      throw new ForbiddenException();
    }

    if ((app as any).generatedProposal) {
      return app;
    }

    const profile = await this.profileService.getProfile(userId);
    const jd = body.description ?? app.rawJobDescription;

    const aiOutput = await this.aiService.generateProposal(profile, jd);

    (app as any).generatedProposal = aiOutput.proposal;
    (app as any).proposalMetadata = aiOutput.metadata;
    (app as any).lastProposalGeneratedAt = new Date();
    await app.save();

    await this.paymentService.createTransaction(
      userId,
      app.companyName,
      'proposal',
    );
    return app;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Post(':id/regenerate-proposal')
  @ApiOperation({
    summary:
      'Regenerate the proposal for an application. Charges one usage credit.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: RegenerateProposalDto })
  async regenerateProposal(
    @Req() req,
    @Param('id') id: string,
    @Body() body: RegenerateProposalDto,
  ) {
    const userId = req.user._id;
    const app = await this.appService.getById(id);
    if (app.user.toString() !== userId.toString()) {
      throw new ForbiddenException();
    }

    const profile = await this.profileService.getProfile(userId);
    const jd = body.description ?? app.rawJobDescription;

    const aiOutput = await this.aiService.generateProposal(profile, jd);

    (app as any).generatedProposal = aiOutput.proposal;
    (app as any).proposalMetadata = aiOutput.metadata;
    (app as any).lastProposalGeneratedAt = new Date();
    await app.save();

    await this.paymentService.createTransaction(
      userId,
      app.companyName,
      'proposal',
    );
    return app;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Post(':id/generate-email')
  @ApiOperation({
    summary:
      'Generate an email for an existing application. Charges COST_PER_EMAIL.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: GenerateEmailDto })
  async generateEmailForApp(
    @Req() req,
    @Param('id') id: string,
    @Body() body: GenerateEmailDto,
  ) {
    const userId = req.user._id;
    const app = await this.appService.getById(id);
    if (app.user.toString() !== userId.toString()) {
      throw new ForbiddenException();
    }

    if ((app as any).generatedEmail) {
      return app;
    }

    const deliverableType: 'resume' | 'proposal' =
      !(app as any).generatedCvData && (app as any).generatedProposal
        ? 'proposal'
        : 'resume';

    const profile = await this.profileService.getProfile(userId);
    const emailOutput = await this.aiService.generateEmail(
      profile,
      app.rawJobDescription,
      {
        tone: body.tone,
        deliverableType,
        companyName: app.companyName,
      },
    );

    (app as any).generatedEmail = emailOutput.body;
    (app as any).emailMetadata = {
      tone: emailOutput.tone,
      subject: emailOutput.subject,
      deliverableType,
      wordCount: emailOutput.wordCount,
    };
    (app as any).lastEmailGeneratedAt = new Date();
    await app.save();

    await this.paymentService.createTransaction(
      userId,
      app.companyName,
      'email',
    );
    return app;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Post(':id/regenerate-email')
  @ApiOperation({
    summary:
      'Regenerate the email for an application (e.g. switch tone). ' +
      'Charges COST_PER_EMAIL.',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: GenerateEmailDto })
  async regenerateEmailForApp(
    @Req() req,
    @Param('id') id: string,
    @Body() body: GenerateEmailDto,
  ) {
    const userId = req.user._id;
    const app = await this.appService.getById(id);
    if (app.user.toString() !== userId.toString()) {
      throw new ForbiddenException();
    }

    const previousMeta = (app as any).emailMetadata;
    const deliverableType: 'resume' | 'proposal' =
      previousMeta?.deliverableType ??
      (!(app as any).generatedCvData && (app as any).generatedProposal
        ? 'proposal'
        : 'resume');

    const profile = await this.profileService.getProfile(userId);
    const emailOutput = await this.aiService.generateEmail(
      profile,
      app.rawJobDescription,
      {
        tone: body.tone,
        deliverableType,
        companyName: app.companyName,
      },
    );

    (app as any).generatedEmail = emailOutput.body;
    (app as any).emailMetadata = {
      tone: emailOutput.tone,
      subject: emailOutput.subject,
      deliverableType,
      wordCount: emailOutput.wordCount,
    };
    (app as any).lastEmailGeneratedAt = new Date();
    await app.save();

    await this.paymentService.createTransaction(
      userId,
      app.companyName,
      'email',
    );
    return app;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get a single application by ID' })
  async findOne(@Req() req, @Param('id') id: string) {
    const application = await this.appService.getById(id);
    if (application.user.toString() !== req.user._id.toString()) {
      throw new ForbiddenException(
        'You do not have permission to view this application',
      );
    }
    return application;
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update application details' })
  @ApiParam({ name: 'id' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateApplicationDto,
    @Req() req,
  ) {
    return this.appService.updateApplication(id, req.user._id, updateDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete an application record' })
  async remove(@Req() req, @Param('id') id: string) {
    await this.appService.deleteApplication(id, req.user._id);
    return { message: 'Application successfully deleted', deletedId: id };
  }

  /**
   * e.g. buildDownloadFilename("Emmanuel Mbagwu", "Backend Engineer", "resume")
   * -> "Emmanuel_Mbagwu_Backend_Engineer_resume.pdf"
   */
  private buildDownloadFilename(
    fullName: string | undefined,
    jobTitle: string | undefined,
    suffix: 'resume' | 'CoverLetter',
  ): string {
    const sanitize = (value?: string) =>
      (value ?? '')
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_');

    const parts = [sanitize(fullName), sanitize(jobTitle)].filter(Boolean);
    const base = parts.length ? parts.join('_') : 'AppliTrack';
    return `${base}_${suffix}.pdf`;
  }

  private async assertOwnership(appId: string, userId: string): Promise<void> {
    const app = await this.appService.getById(appId);
    if (!app) throw new NotFoundException('Application not found');
    if (String(app.user) !== String(userId)) {
      throw new ForbiddenException(
        'You do not have permission to download this application',
      );
    }
  }

  private async buildCoverLetter(
    cvData: any,
    jobData: { title: string; company: string; description: string },
    userId: string,
  ): Promise<string> {
    const recent = await this.appService.getMostRecentWithCoverLetter(userId);
    if (!recent?.generatedCoverLetter) {
      return this.templateCoverLetter(cvData, jobData);
    }
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
