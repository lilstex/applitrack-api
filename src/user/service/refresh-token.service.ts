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

  // Grace window during which a *just-replaced* refresh token can still be
  // presented without being treated as theft. This is what makes concurrent
  // refresh calls (a second open tab, a duplicate in-flight request, a
  // background tab waking up) safe instead of nuking the whole session the
  // instant two requests race each other with the same token.
  private static readonly REUSE_GRACE_MS = 30_000;
  private static readonly MAX_CHAIN_HOPS = 5;

  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTtlSec = parseInt(
      this.config.get<string>('ACCESS_TOKEN_TTL_SEC') ?? '21600',
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
    let stored: any = await this.refreshTokenModel
      .findOne({ tokenHash: hash })
      .populate<{ user: User }>('user');

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.replacedBy || stored.revokedAt) {
      const withinGrace =
        !!stored.revokedAt &&
        Date.now() - stored.revokedAt.getTime() <
          RefreshTokenService.REUSE_GRACE_MS;

      const latest = withinGrace
        ? await this.resolveLatestInChain(stored.replacedBy)
        : null;

      if (!latest) {
        this.logger.warn(
          `Refresh token reuse detected for user ${(stored.user as any)?._id} ` +
            `family ${stored.family}. Revoking family.`,
        );
        await this.revokeFamily(stored.family);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      // A concurrent request already rotated this token moments ago (e.g. a
      // second tab, or a duplicate in-flight call). Treat the presented
      // token as still good and fast-forward to the current one instead of
      // punishing a benign race.
      stored = latest;
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
   * Follow a `replacedBy` chain to the current, still-valid token, stopping
   * after MAX_CHAIN_HOPS to bound the lookup. Returns null if the chain
   * breaks (missing link) or ends on a token that's revoked with nothing
   * newer within the grace window.
   */
  private async resolveLatestInChain(
    replacedByHash: string | null | undefined,
    hops = 0,
  ): Promise<any | null> {
    if (!replacedByHash || hops >= RefreshTokenService.MAX_CHAIN_HOPS) {
      return null;
    }

    const next: any = await this.refreshTokenModel
      .findOne({ tokenHash: replacedByHash })
      .populate<{ user: User }>('user');

    if (!next) return null;
    if (!next.revokedAt) return next;

    return this.resolveLatestInChain(next.replacedBy, hops + 1);
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
