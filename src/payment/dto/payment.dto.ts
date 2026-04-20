import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export enum PaymentGateway {
  LEMONSQUEEZY = 'lemonsqueezy',
  PAYSTACK = 'paystack',
}

export class TopUpDto {
  @ApiProperty({ enum: PaymentGateway })
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @ApiProperty({
    description: 'The slug of the credit bundle/plan being purchased',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;
}

export class CreateCreditPlanDto {
  @ApiProperty({ example: 'pro-pack', description: 'Unique slug for the plan' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'Professional Pack', description: 'Display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 60, description: 'Number of credits awarded' })
  @IsNumber()
  credits: number;

  @ApiProperty({ example: 5000, description: 'Price in NGN (for Paystack)' })
  @IsNumber()
  priceNgn: number;

  @ApiProperty({ example: 10, description: 'Price in USD (for Lemon Squeezy)' })
  @IsNumber()
  priceUsd: number;

  @ApiProperty({
    example: '123456',
    description: 'Lemon Squeezy Variant ID for this plan',
  })
  @IsString()
  @IsNotEmpty()
  lemonSqueezyVariantId: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCreditPlanDto extends PartialType(CreateCreditPlanDto) {}
