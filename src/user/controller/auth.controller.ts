import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
  Req,
  Get,
  Query,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from '../service/auth.service';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  ResetPasswordDto,
  SignupDto,
} from '../dto/auth.dto';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { TurnstileGuard } from 'src/security/guards/turnstile.guard';

/**
 * Sets the JWT as an HttpOnly + Secure + SameSite cookie.
 * The browser will send it automatically; JS cannot read it (defeats XSS-based
 * token theft).
 */
function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ long: { ttl: 3600000, limit: 3 } })
  @UseGuards(TurnstileGuard)
  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'Verification email sent.' })
  @ApiBody({ type: SignupDto })
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @SkipThrottle({ short: true })
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email via token from welcome email' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Throttle({ medium: { ttl: 60000, limit: 5 } })
  @UseGuards(TurnstileGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Successful login',
    type: LoginResponseDto,
  })
  @ApiBody({ type: LoginDto })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, role } = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    setAuthCookie(res, access_token);
    return { role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — clears auth cookie' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', { path: '/' });
    return { success: true };
  }

  @Throttle({ long: { ttl: 3600000, limit: 3 } })
  @UseGuards(TurnstileGuard)
  @Post('forgot-password')
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOperation({ summary: 'Forgot password' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Throttle({ medium: { ttl: 60000, limit: 5 } })
  @Post('reset-password')
  @ApiBody({ type: ResetPasswordDto, description: 'Reset Password' })
  @ApiOperation({ summary: 'Reset Password' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
