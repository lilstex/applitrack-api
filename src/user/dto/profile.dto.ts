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
  @ApiPropertyOptional() @IsOptional() @IsString() degree?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() school?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() year?: string;
}

class CertificationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
}

export class ProjectDto {
  @ApiProperty({ example: 'OpenBudget API' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Open-source REST API for budget tracking' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: 'https://github.com/user/project' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ example: ['Node.js', 'PostgreSQL'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  techStack?: string[];

  @ApiPropertyOptional({ example: ['Reduced latency by 30%'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];
}

export class LanguageDto {
  @ApiProperty({ example: 'French' })
  @IsString()
  @IsNotEmpty()
  language: string;

  @ApiProperty({ example: 'Intermediate' })
  @IsString()
  @IsNotEmpty()
  proficiency: string;
}

export class AwardDto {
  @ApiProperty({ example: 'Best API Design' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Google Developer Awards' })
  @IsString()
  @IsNotEmpty()
  issuer: string;

  @ApiProperty({ example: '2023' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional({ example: 'Awarded for outstanding API architecture' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class VolunteerWorkDto {
  @ApiProperty({ example: 'Code for Africa' })
  @IsString()
  @IsNotEmpty()
  organization: string;

  @ApiProperty({ example: 'Backend Mentor' })
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ example: '2022-01-01' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2023-06-01' })
  @IsString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({
    example: 'Mentored 15 junior developers in Node.js and API design',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class ExperienceDto {
  @ApiProperty({ example: 'Google' }) @IsString() @IsNotEmpty() company: string;
  @ApiProperty({ example: 'Senior DevOps Engineer' })
  @IsString()
  @IsNotEmpty()
  role: string;
  @ApiProperty({ example: ['Automated CI/CD pipelines'] })
  @IsArray()
  @IsString({ each: true })
  highlights: string[];
  @ApiPropertyOptional({ example: ['NodeJS', 'PHP'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologiesUsed?: string[];
  @ApiProperty({ example: '2020-01-01' }) @IsString() startDate: string;
  @ApiProperty({ example: 'Present' }) @IsString() endDate: string;
}

export class UpdateBasicInfoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phoneNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedinUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() githubUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() portfolioUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() summary?: string;
  @ApiPropertyOptional({ example: ['NodeJS', 'PHP'] })
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
  @ApiPropertyOptional({ type: [ProjectDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDto)
  projects?: ProjectDto[];
  @ApiPropertyOptional({ type: [LanguageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LanguageDto)
  languages?: LanguageDto[];
  @ApiPropertyOptional({ type: [AwardDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardDto)
  awards?: AwardDto[];
  @ApiPropertyOptional({ type: [VolunteerWorkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VolunteerWorkDto)
  volunteerWork?: VolunteerWorkDto[];
}
