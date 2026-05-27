import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RefreshToken } from '../schema/refresh-token.schema';
import { User } from '../schema/user.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSec: number;
  refreshTokenExpiresInSec: number;
}

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;

  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTtlSec = parseInt(
      this.config.get<string>('ACCESS_TOKEN_TTL_SEC') ?? '900',
      10,
    );
    this.refreshTtlSec = parseInt(
      this.config.get<string>('REFRESH_TOKEN_TTL_SEC') ?? '2592000',
      10,
    );
  }

  async issueNewPair(
    user: Pick<User, '_id' | 'email' | 'role'>,
    ctx: RequestContext = {},
  ): Promise<TokenPair> {
    return this.mintPair(user, randomUUID(), ctx);
  }

  async rotate(
    presentedToken: string,
    ctx: RequestContext = {},
  ): Promise<TokenPair> {
    if (!presentedToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const hash = this.hashToken(presentedToken);
    const stored = await this.refreshTokenModel
      .findOne({ tokenHash: hash })
      .populate<{ user: User }>('user');

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.replacedBy || stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${(stored.user as any)?._id} ` +
          `family ${stored.family}. Revoking family.`,
      );
      await this.revokeFamily(stored.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = stored.user as unknown as User;
    if (!user) {
      throw new UnauthorizedException('User not found for refresh token');
    }

    const newPair = await this.mintPair(
      {
        _id: (user as any)._id,
        email: user.email,
        role: user.role,
      },
      stored.family,
      ctx,
    );

    stored.revokedAt = new Date();
    stored.replacedBy = this.hashToken(newPair.refreshToken);
    await stored.save();

    return newPair;
  }

  async revokeToken(presentedToken: string): Promise<void> {
    if (!presentedToken) return;
    const hash = this.hashToken(presentedToken);
    await this.refreshTokenModel.updateOne(
      { tokenHash: hash, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  /**
   * Revoke every refresh token in a family.
   */
  private async revokeFamily(family: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { family, revokedAt: null },
      { revokedAt: new Date() },
    );
  }

  private async mintPair(
    user: { _id: any; email: string; role: string },
    family: string,
    ctx: RequestContext,
  ): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { id: user._id, email: user.email, role: user.role },
      { expiresIn: this.accessTtlSec },
    );

    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlSec * 1000);

    await this.refreshTokenModel.create({
      user: user._id,
      tokenHash: this.hashToken(refreshToken),
      family,
      expiresAt,
      userAgent: ctx.userAgent?.slice(0, 200),
      ip: ctx.ip?.slice(0, 64),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresInSec: this.accessTtlSec,
      refreshTokenExpiresInSec: this.refreshTtlSec,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
