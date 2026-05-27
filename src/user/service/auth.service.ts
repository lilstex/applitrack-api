import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../schema/user.schema';
import {
  calculateExpirationDate,
  generatePasswordToken,
} from 'src/util/helper';
import { EmailService } from 'src/providers/email/email.service';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SignupDto,
} from '../dto/auth.dto';
import { RefreshTokenService } from './refresh-token.service';

const DUMMY_BCRYPT_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8gn0/lQ8RtIu1z9rB2RHk3vh2Y3w/u';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'throwawaymail.com',
  'yopmail.com',
  'fakeinbox.com',
  'trashmail.com',
  'getnada.com',
  'sharklasers.com',
]);

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private refreshTokenService: RefreshTokenService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isDisposable(email: string): boolean {
    const domain = email.split('@')[1];
    return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
  }

  private async sendVerificationEmail(payload: {
    fullName: string;
    email: string;
    rawToken?: string;
  }) {
    if (!payload.rawToken) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await this.userModel.updateOne(
        { email: payload.email },
        {
          emailVerificationToken: this.hashToken(rawToken),
          emailVerificationExpiresAt: calculateExpirationDate(24),
        },
      );
      payload.rawToken = rawToken;
    }

    const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${payload.rawToken}`;
    try {
      await this.emailService.sendEmail({
        to: payload.email,
        from:
          process.env.EMAIL_FROM || 'ShotNub<applitrack@shotnubsolutions.com>',
        subject: 'Verify your AppliTrack account',
        html: `<p>Hi ${payload.fullName},</p>
               <p>Confirm your email by clicking the link below (expires in 24h):</p>
               <p><a href="${verifyLink}">${verifyLink}</a></p>`,
      });
    } catch (err) {
      this.logger.error('Failed to send verification email', err);
    }
  }

  async signup(userData: SignupDto) {
    const email = this.normaliseEmail(userData.email);

    if (this.isDisposable(email)) {
      throw new BadRequestException('Please use a permanent email address.');
    }

    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      if (!existingUser.isEmailVerified) {
        await this.sendVerificationEmail(existingUser as any);
      }
      return {
        message: 'If the email is valid, a verification link has been sent.',
      };
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);

    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const hashedVerifyToken = this.hashToken(rawVerifyToken);

    const newUser = await this.userModel.create({
      ...userData,
      email,
      password: hashedPassword,
      credits: 0,
      isEmailVerified: false,
      emailVerificationToken: hashedVerifyToken,
      emailVerificationExpiresAt: calculateExpirationDate(24),
    });

    await this.sendVerificationEmail({
      fullName: newUser.fullName,
      email: newUser.email,
      rawToken: rawVerifyToken,
    });

    return {
      message: 'If the email is valid, a verification link has been sent.',
    };
  }

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Missing token');

    const user = await this.userModel.findOne({
      emailVerificationToken: this.hashToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;
    user.credits = 25;
    await user.save();

    return { success: true, message: 'Email verified' };
  }

  async login(emailInput: string, password: string) {
    const email = this.normaliseEmail(emailInput);
    const user = await this.userModel.findOne({ email }).select('+password');

    const hashToCheck = user?.password ?? DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordValid) {
      if (user) {
        const updated = await this.userModel.findByIdAndUpdate(
          user._id,
          { $inc: { failedLoginAttempts: 1 } },
          { new: true },
        );
        if (
          updated &&
          updated.failedLoginAttempts >= MAX_FAILED_LOGINS &&
          !updated.lockedUntil
        ) {
          updated.lockedUntil = new Date(
            Date.now() + LOCKOUT_MINUTES * 60 * 1000,
          );
          await updated.save();
        }
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked. Try again in a few minutes.`,
      );
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Account disabled. Contact support.');
    }

    // Reset failed-attempt counter on success.
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await user.save();
    }

    const payload = { id: user._id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
      role: user.role,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = this.normaliseEmail(forgotPasswordDto.email);
    const user = await this.userModel.findOne({ email });

    if (user && user.isEmailVerified) {
      const rawToken = generatePasswordToken();
      user.resetToken = this.hashToken(rawToken);
      user.passwordResetTokenExpiresAt = calculateExpirationDate(1);
      await user.save();

      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
      try {
        await this.emailService.sendPasswordResetLink({
          user: user.fullName,
          email: user.email,
          link: resetLink,
        });
      } catch (err) {
        this.logger.error('Reset email failed', err);
      }
    }

    return {
      success: true,
      message: 'If that email is on file, a password reset link has been sent.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { resetToken, password } = resetPasswordDto;
    if (!resetToken) throw new BadRequestException('Missing token');

    const hashed = this.hashToken(resetToken);
    const user = await this.userModel.findOne({
      resetToken: hashed,
      passwordResetTokenExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetToken = null;
    user.passwordResetTokenExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await this.refreshTokenService.revokeAllForUser(String(user._id));

    return { success: true, message: 'Password reset successfully' };
  }

  async loginAndReturnUser(emailInput: string, password: string) {
    const email = this.normaliseEmail(emailInput);
    const user = await this.userModel.findOne({ email }).select('+password');

    const hashToCheck = user?.password ?? DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordValid) {
      if (user) {
        const updated = await this.userModel.findByIdAndUpdate(
          user._id,
          { $inc: { failedLoginAttempts: 1 } },
          { new: true },
        );
        if (
          updated &&
          updated.failedLoginAttempts >= MAX_FAILED_LOGINS &&
          !updated.lockedUntil
        ) {
          updated.lockedUntil = new Date(
            Date.now() + LOCKOUT_MINUTES * 60 * 1000,
          );
          await updated.save();
        }
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account locked. Try again in a few minutes.',
      );
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('Account disabled. Contact support.');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await user.save();
    }

    return {
      _id: user._id,
      email: user.email,
      role: user.role,
    } as any;
  }
}
