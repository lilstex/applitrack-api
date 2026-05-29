import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

export class GenerateCvDto {
  @ApiProperty({
    example: 'Senior Laravel Developer',
    description: 'The title of the job you are applying for',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Tech Solutions Malta',
    description: 'The name of the hiring company',
  })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiProperty({
    example:
      'We are looking for a backend engineer with 5+ years of experience in...',
    description: 'The full job description text',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(50)
  description: string;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional({
    example: 'Senior Backend Engineer',
    description: 'The tailored job title',
  })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({
    example: 'Tech Solutions Inc.',
    description: 'The name of the company',
  })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({
    description: 'The full AI-generated cover letter text',
  })
  @IsOptional()
  @IsString()
  generatedCoverLetter?: string;

  @ApiPropertyOptional({
    description:
      'The full CV data object — all 8 sections (summary, experience, skills, ' +
      'education, certifications, projects, languages, awards, volunteerWork)',
  })
  @IsOptional()
  @IsObject()
  generatedCvData?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'The full proposal text (Upwork / freelance format)',
  })
  @IsOptional()
  @IsString()
  generatedProposal?: string;

  @ApiPropertyOptional({
    description:
      'Proposal metadata: extracted JD instructions, questions, etc. ' +
      'Generally set by the server, but accepted on PATCH for completeness.',
  })
  @IsOptional()
  @IsObject()
  proposalMetadata?: Record<string, any>;
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

export class GenerateProposalDto {
  @ApiProperty({ example: 'Senior React Developer (Remote)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Acme Co' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company: string;

  @ApiProperty({
    example:
      'We are looking for a senior React developer to help us migrate our legacy Angular app...',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(50, {
    message: 'Job description must be at least 50 characters',
  })
  @MaxLength(20000)
  description: string;
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
