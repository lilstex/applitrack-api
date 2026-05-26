import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import { ProfileService } from '../service/profile.service';
import { UserGuard } from 'src/security/guards/auth.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ExperienceDto, UpdateBasicInfoDto } from '../dto/profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { OpenAIService } from 'src/job-application/service/openai.service';
import { ChangePasswordDto } from '../dto/auth.dto';
import { assertIsPdf } from 'src/security/validators/pdf.validator';

const FIVE_MB = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'application/vnd.pdf',
]);

@ApiTags('User Profile')
@ApiBearerAuth()
@UseGuards(UserGuard)
@Controller('profile')
export class ProfileController {
  constructor(
    private profileService: ProfileService,
    private aiService: OpenAIService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current user master profile' })
  async getMyProfile(@Req() req) {
    return this.profileService.getProfile(req.user._id);
  }

  @Patch('basic')
  @ApiOperation({ summary: 'Update basic contact and summary info' })
  @ApiBody({ type: UpdateBasicInfoDto })
  async updateInfo(@Req() req, @Body() updateData: UpdateBasicInfoDto) {
    return this.profileService.updateBasicInfo(req.user._id, updateData);
  }

  @Post('experience')
  @ApiOperation({ summary: 'Add a new work experience' })
  @ApiBody({ type: ExperienceDto })
  async addExp(@Req() req, @Body() experience: ExperienceDto) {
    return this.profileService.addExperience(req.user._id, experience);
  }

  @Post('upload-resume')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: FIVE_MB, files: 1 },
      fileFilter: (_req, file, callback) => {
        const extOk = /\.pdf$/i.test(file.originalname);
        const mimeOk = ALLOWED_MIME.has(file.mimetype);
        if (!extOk || !mimeOk) {
          return callback(
            new BadRequestException(
              'Only PDF files are allowed (received: ' + file.mimetype + ')',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload an existing resume to populate profile' })
  async uploadResume(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    assertIsPdf(file.buffer, { maxSizeBytes: FIVE_MB });

    const userId = req.user._id;
    const extractedData = await this.aiService.extractDataFromPdf(file.buffer);
    return this.profileService.updateProfile(userId, extractedData);
  }

  @Get('status')
  @ApiOperation({ summary: 'Check if user profile is completed' })
  async getProfileStatus(@Req() req) {
    const userId = req.user._id;
    const user = await this.profileService.getProfile(userId);
    return {
      isCompleted: user.workExperience && user.workExperience.length > 0,
    };
  }

  @Patch('experience/:id')
  @ApiOperation({ summary: 'Update an existing work experience' })
  @ApiParam({ name: 'id', description: 'The unique ID of the experience item' })
  @ApiBody({ type: ExperienceDto })
  async updateExp(
    @Req() req,
    @Param('id') expId: string,
    @Body() data: ExperienceDto,
  ) {
    return this.profileService.updateExperience(req.user._id, expId, data);
  }

  @Delete('experience/:id')
  @ApiOperation({ summary: 'Remove a work experience' })
  @ApiParam({ name: 'id', description: 'The unique ID of the experience item' })
  async removeExp(@Req() req, @Param('id') expId: string) {
    return this.profileService.removeExperience(req.user._id, expId);
  }

  @Post('change-password')
  @ApiResponse({
    status: 200,
    description: 'Change Password',
  })
  @ApiBody({ type: ChangePasswordDto, description: 'Change Password' })
  @ApiOperation({ summary: 'Change Password' })
  async changePassword(
    @Req() request,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const userId = request.user.id;
    return this.profileService.changePassword(userId, changePasswordDto);
  }
}
