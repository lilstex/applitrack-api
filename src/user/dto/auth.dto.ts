import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// One uppercase, one lowercase, one number, one symbol, 8+ chars.
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

const PASSWORD_RULE =
  'Password must be 8+ chars with upper, lower, number, and symbol';

export class SignupDto {
  @ApiProperty({ example: 'emmanuelmbagwu77@gmail.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE })
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Emmanuel Mbagwu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[\p{L} .'-]+$/u, {
    message: 'Full name contains invalid characters',
  })
  fullName: string;

  @ApiProperty({ required: false, description: 'Cloudflare Turnstile token' })
  turnstileToken?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'emmanuelmbagwu77@gmail.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiProperty({ required: false })
  turnstileToken?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  resetToken: string;

  @ApiProperty({ required: true, example: 'Password@123' })
  @IsNotEmpty()
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE })
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE })
  @MaxLength(128)
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'johndoe@test.com', required: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ required: false })
  turnstileToken?: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'user' })
  role: string;
}
