import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  limit?: number;
}

export class GetUsersDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'emmanuel',
    description: 'Search by full name or email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'admin',
    description: 'Filter by role (user | admin)',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  role: string;
}

export class UpdateUserCreditsDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  credits: number;
}

export class CreateCreditPlanDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  credits: number;

  @ApiProperty()
  priceNgn: number;

  @ApiProperty()
  priceUsd: number;

  @ApiPropertyOptional()
  lemonSqueezyVariantId?: string;

  @ApiPropertyOptional()
  stripePriceId?: string;
}

export class UpdateCreditPlanDto extends CreateCreditPlanDto {}

export class TransactionFilterDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'purchase' })
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Search by user name/email or reference',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ApplicationFilterDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by job title or company name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by application status' })
  @IsOptional()
  @IsString()
  status?: string;
}
