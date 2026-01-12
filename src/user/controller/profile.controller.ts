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
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
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
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(pdf)$/)) {
          return callback(
            new BadRequestException('Only PDF files are allowed!'),
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
    const userId = req.user._id;

    // Extract data via AI
    const extractedData = await this.aiService.extractDataFromPdf(file.buffer);

    // Update user profile with extracted data
    return this.profileService.updateProfile(userId, extractedData);
  }

  @Get('status')
  @ApiOperation({ summary: 'Check if user profile is completed' })
  @ApiResponse({ status: 200, description: 'Returns completion status' })
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
}
