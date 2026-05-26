import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Verifies a Cloudflare Turnstile token on incoming requests.
 * Frontend sends the token in `cf-turnstile-token` header OR `turnstileToken`
 * field in the request body.
 *
 * Attach with @UseGuards(TurnstileGuard) on any public endpoint vulnerable
 * to bot abuse (signup, login, forgot-password, etc).
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);
  private readonly verifyUrl =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      if (this.config.get('NODE_ENV') === 'production') {
        this.logger.error('TURNSTILE_SECRET_KEY is missing in production');
        throw new BadRequestException('Verification service misconfigured');
      }
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const token: string | undefined =
      req.headers['cf-turnstile-token'] ??
      req.body?.turnstileToken ??
      req.body?.['cf-turnstile-response'];

    if (!token) {
      throw new BadRequestException('Missing verification token');
    }

    const remoteip: string | undefined =
      req.ip ?? req.headers['cf-connecting-ip'] ?? req.headers['x-real-ip'];

    try {
      const params = new URLSearchParams();
      params.append('secret', secret);
      params.append('response', token);
      if (remoteip) params.append('remoteip', remoteip);

      const { data } = await axios.post(this.verifyUrl, params, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!data.success) {
        this.logger.warn(
          `Turnstile verification failed: ${JSON.stringify(data['error-codes'])}`,
        );
        throw new BadRequestException('Verification failed. Please try again.');
      }

      if (req.body) delete req.body.turnstileToken;
      return true;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('Turnstile siteverify call failed', err);
      throw new BadRequestException('Verification service unavailable');
    }
  }
}
