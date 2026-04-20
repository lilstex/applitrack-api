import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
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
    example: 'Dear Hiring Manager...',
    description: 'The full AI-generated cover letter text',
  })
  @IsOptional()
  @IsString()
  generatedCoverLetter?: string;

  @ApiPropertyOptional({
    description:
      'The complex CV data object containing summary, experience, skills, and education',
    example: {
      professionalSummary: 'Result-driven engineer...',
      refinedExperience: [
        {
          role: 'Lead Dev',
          company: 'Acme',
          startDate: '2020',
          endDate: '2022',
          highlights: ['Led team'],
        },
      ],
      relevantSkills: ['NodeJS', 'TypeScript'],
      education: [{ degree: 'BSc', school: 'Uni', year: '2019' }],
      certifications: [{ title: 'AWS Cert', issuer: 'Amazon', date: '2023' }],
    },
  })
  @IsOptional()
  @IsObject()
  generatedCvData?: {
    professionalSummary: string;
    refinedExperience: any[];
    relevantSkills: string[];
    education: any[];
    certifications: any[];
  };
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
