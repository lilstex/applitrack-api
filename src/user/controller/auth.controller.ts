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
  UnauthorizedException,
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
import {
  RefreshTokenService,
  TokenPair,
} from '../service/refresh-token.service';

const REFRESH_COOKIE_PATH = '/api/v1/auth';

function cookieBaseOpts() {
  const useSecureCrossSite = process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    secure: useSecureCrossSite,
    sameSite: (useSecureCrossSite ? 'none' : 'lax') as 'none' | 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
  };
}

function setTokenPair(res: Response, pair: TokenPair) {
  const base = cookieBaseOpts();
  res.cookie('token', pair.accessToken, {
    ...base,
    maxAge: pair.accessTokenExpiresInSec * 1000,
    path: '/',
  });
  res.cookie('refresh_token', pair.refreshToken, {
    ...base,
    maxAge: pair.refreshTokenExpiresInSec * 1000,
    path: REFRESH_COOKIE_PATH,
  });
}

function clearTokenPair(res: Response) {
  const base = cookieBaseOpts();
  res.clearCookie('token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: REFRESH_COOKIE_PATH });
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private refreshTokenService: RefreshTokenService,
  ) {}

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.loginAndReturnUser(
      loginDto.email,
      loginDto.password,
    );
    const pair = await this.refreshTokenService.issueNewPair(user, {
      userAgent: req.headers['user-agent'] as string | undefined,
      ip: req.ip,
    });
    setTokenPair(res, pair);
    return { role: user.role };
  }

  @SkipThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange refresh token for a new token pair' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = (req as any).cookies?.refresh_token;
    if (!presented) {
      throw new UnauthorizedException('Missing refresh token');
    }

    try {
      const pair = await this.refreshTokenService.rotate(presented, {
        userAgent: req.headers['user-agent'] as string | undefined,
        ip: req.ip,
      });
      setTokenPair(res, pair);
      return { success: true };
    } catch (err) {
      clearTokenPair(res);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout — clears auth cookies and revokes refresh token',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req as any).cookies?.refresh_token;
    if (presented) {
      await this.refreshTokenService.revokeToken(presented);
    }
    clearTokenPair(res);
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
