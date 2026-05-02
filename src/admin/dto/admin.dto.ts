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

  @ApiProperty()
  lemonSqueezyVariantId: string;
}

export class UpdateCreditPlanDto extends CreateCreditPlanDto {}

export class TransactionFilterDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'purchase' })
  @IsOptional()
  type?: string;
}

export class ApplicationFilterDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  jobTitle?: string;
}