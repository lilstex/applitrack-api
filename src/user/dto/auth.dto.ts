import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({
    example: 'emmanuelmbagwu77@gmail.com',
    description: 'The email of the user',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password@123',
    description: 'User password (min 8 chars)',
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    example: 'Emmanuel Mbagwu',
    description: 'Full name of the user',
  })
  @IsString()
  @IsNotEmpty()
  fullName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'emmanuelmbagwu77@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    example: '33147121942086d81f43ab9d219bf074',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  resetToken: string;

  @ApiProperty({
    example: 'Password@123',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    example: 'Password@123',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @ApiProperty({
    example: 'Password@1234',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'johndoe@test.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;
}
