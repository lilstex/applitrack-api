import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class EducationDto {
  @ApiPropertyOptional({ example: 'BSc Computer Science' })
  @IsOptional()
  @IsString()
  degree?: string;

  @ApiPropertyOptional({ example: 'University of Lagos' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional({ example: '2020' })
  @IsOptional()
  @IsString()
  year?: string;
}

class CertificationDto {
  @ApiPropertyOptional({ example: 'AWS Certified Solutions Architect' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Amazon Web Services' })
  @IsOptional()
  @IsString()
  issuer?: string;

  @ApiPropertyOptional({ example: '2023' })
  @IsOptional()
  @IsString()
  date?: string;
}

export class ExperienceDto {
  @ApiProperty({ example: 'Google' })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiProperty({ example: 'Senior DevOps Engineer' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({
    example: [
      'Automated CI/CD pipelines',
      'Optimized Kubernetes clusters',
      'Optimized Database queries',
      'Reduced deployment time',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  highlights: string[];

  @ApiPropertyOptional({ example: ['NodeJS', 'PHP', 'NestJS'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologiesUsed?: string[];

  @ApiProperty({ example: '2020-01-01' })
  @IsString()
  startDate: string;

  @ApiProperty({ example: 'Present' })
  @IsString()
  endDate: string;
}

export class UpdateBasicInfoDto {
  @ApiPropertyOptional({ example: 'Emmanuel Mbagwu' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: '+2348162696846' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: 'https://www.linkedin.com/in/lilstex-emmanuel/',
  })
  @IsOptional()
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: 'Experienced PHP & NodeJs engineer...' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ example: ['NodeJS', 'PHP', 'NestJS'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: [ExperienceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  workExperience?: ExperienceDto[];

  @ApiPropertyOptional({ type: [EducationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @ApiPropertyOptional({ type: [CertificationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificationDto)
  certifications?: CertificationDto[];
}
