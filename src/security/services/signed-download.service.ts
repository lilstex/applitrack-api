import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

interface SignedDownloadOptions {
  resourceId: string;
  userId: string;
  scope: string;
  ttlSeconds?: number;
}

interface SignedDownloadPayload {
  resourceId: string;
  userId: string;
  scope: string;
  exp: number;
  nonce: string;
  sig: string;
}

class NonceCache {
  private store = new Map<string, number>();
  private lastSweep = 0;

  has(nonce: string): boolean {
    this.sweep();
    return this.store.has(nonce);
  }

  remember(nonce: string, expUnixSec: number): void {
    this.store.set(nonce, expUnixSec);
  }

  private sweep(): void {
    const now = Math.floor(Date.now() / 1000);
    if (now - this.lastSweep < 30) return;
    this.lastSweep = now;
    for (const [k, v] of this.store) {
      if (v <= now) this.store.delete(k);
    }
  }
}

@Injectable()
export class SignedDownloadService {
  private readonly logger = new Logger(SignedDownloadService.name);
  private readonly nonces = new NonceCache();
  private readonly secret: Buffer;

  constructor(config: ConfigService) {
    const raw =
      config.get<string>('DOWNLOAD_URL_SECRET') ??
      config.get<string>('JWT_SECRET');
    if (!raw || raw.length < 32) {
      throw new Error(
        'SignedDownloadService requires DOWNLOAD_URL_SECRET or JWT_SECRET (>=32 chars)',
      );
    }
    this.secret = Buffer.from(raw, 'utf8');
  }

  sign(opts: SignedDownloadOptions): string {
    const ttl = opts.ttlSeconds ?? 60;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const nonce = randomBytes(12).toString('hex');

    const sig = this.computeSignature({
      resourceId: opts.resourceId,
      userId: opts.userId,
      scope: opts.scope,
      exp,
      nonce,
    });

    const params = new URLSearchParams({
      sig,
      exp: String(exp),
      n: nonce,
      u: opts.userId,
    });
    return params.toString();
  }

  verify(params: {
    resourceId: string;
    scope: string;
    sig?: string;
    exp?: string | number;
    nonce?: string;
    userId?: string;
  }): { userId: string } {
    const { resourceId, scope, sig, exp, nonce, userId } = params;

    if (!sig || !exp || !nonce || !userId) {
      throw new UnauthorizedException('Missing signature parameters');
    }

    const expNum = Number(exp);
    if (!Number.isFinite(expNum)) {
      throw new UnauthorizedException('Invalid expiry');
    }
    if (expNum < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Download link expired');
    }

    if (this.nonces.has(nonce)) {
      throw new UnauthorizedException('Download link already used');
    }

    const expected = this.computeSignature({
      resourceId,
      userId,
      scope,
      exp: expNum,
      nonce,
    });

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid download signature');
    }

    this.nonces.remember(nonce, expNum);

    return { userId };
  }

  private computeSignature(p: Omit<SignedDownloadPayload, 'sig'>): string {
    const canonical = [
      'v1',
      p.scope,
      p.resourceId,
      p.userId,
      String(p.exp),
      p.nonce,
    ].join('\n');
    return createHmac('sha256', this.secret).update(canonical).digest('hex');
  }
}
