import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum ApplicationStatus {
  GENERATED = 'generated', // CV/Cover Letter created but not yet sent
  APPLIED = 'applied', // Successfully submitted to the company
  INTERVIEWING = 'interviewing', // In the recruitment process
  OFFER_RECEIVED = 'offered', // Received a job offer
  HIRED = 'hired', // Job secured
  REJECTED = 'rejected', // Application was not successful
}

export enum EmailTone {
  DIRECT = 'direct',
  WARM = 'warm',
}

export class GenerateCvDto {
  @ApiProperty() @IsString() @MinLength(1) title: string;
  @ApiProperty() @IsString() @MinLength(1) company: string;
  @ApiProperty() @IsString() @MinLength(50) description: string;

  @ApiPropertyOptional({
    description:
      'When true, also generate an application email and charge ' +
      'COST_PER_EMAIL extra. Default false.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  generateEmail?: boolean;

  @ApiPropertyOptional({
    enum: EmailTone,
    description:
      'Tone for the email. Required when generateEmail is true. ' +
      "'direct' = confident and to-the-point. 'warm' = story-led, more personality.",
  })
  @IsOptional()
  @IsEnum(EmailTone)
  emailTone?: EmailTone;
}

export class GenerateProposalDto {
  @ApiProperty() @IsString() @MinLength(1) title: string;
  @ApiProperty() @IsString() @MinLength(1) company: string;
  @ApiProperty() @IsString() @MinLength(50) description: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  generateEmail?: boolean;

  @ApiPropertyOptional({ enum: EmailTone })
  @IsOptional()
  @IsEnum(EmailTone)
  emailTone?: EmailTone;
}

export class GenerateEmailDto {
  @ApiProperty({
    enum: EmailTone,
    description:
      "Tone: 'direct' for confident & to-the-point, 'warm' for story-led.",
  })
  @IsEnum(EmailTone)
  tone: EmailTone;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  generatedCoverLetter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  generatedCvData?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  generatedProposal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  proposalMetadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  generatedEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  emailMetadata?: Record<string, any>;
}

export class UpdateStatusDto {
  @ApiProperty({
    description: 'The new status of the job application',
    enum: ApplicationStatus,
    example: ApplicationStatus.APPLIED,
  })
  @IsEnum(ApplicationStatus, {
    message:
      'Status must be one of: generated, applied, interviewing, offered, hired, rejected',
  })
  status: ApplicationStatus;
}

export class ApplicationResponseDto {
  @ApiProperty({ example: '6592f1b2c9e3...' })
  _id: string;

  @ApiProperty({ example: 'generated' })
  status: string;

  @ApiProperty({ description: 'The MD5 hash of the job description' })
  jdHash: string;
}

export class RegenerateProposalDto {
  @ApiProperty({
    required: false,
    description:
      'Optional override JD. If omitted, the application stored JD is used.',
  })
  @IsOptional()
  @IsString()
  @MinLength(50)
  @MaxLength(20000)
  description?: string;
}
