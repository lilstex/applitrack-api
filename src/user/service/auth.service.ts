import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../schema/user.schema';
import {
  calculateExpirationDate,
  generatePasswordToken,
} from 'src/util/helper';
import { EmailService } from 'src/providers/email/email.service';
import { ForgotPasswordDto, ResetPasswordDto } from '../dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async signup(userData: any) {
    const { email, password } = userData;

    // Check if user exists
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) throw new ConflictException('Email already registered');

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new this.userModel({
      ...userData,
      password: hashedPassword,
    });

    await newUser.save();
    return { message: 'Account created successfully' };
  }

  async login(email: string, pass: string) {
    const user = await this.userModel.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(pass, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { id: user._id, email: user.email };
    return {
      access_token: await this.jwtService.signAsync(payload),
      role: user.role,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    try {
      const { email } = forgotPasswordDto;
      const user = await this.userModel
        .findOne({ email })
        .select('-otp -resetToken -password -passwordResetTokenExpiresAt');

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const resetToken: string = generatePasswordToken(); // Generate token
      const expirationDate: Date = calculateExpirationDate(1); // 1 hour

      user.resetToken = resetToken;
      user.passwordResetTokenExpiresAt = expirationDate;
      await user.save();

      const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${email}&token=${resetToken}`;

      // SEND LINK TO USER
      await this.emailService.sendPasswordResetLink({
        user: user.fullName,
        email: user.email,
        link: resetLink,
      });

      return { success: true, message: 'Password reset link sent to email' };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Failed to process forgot password request',
      );
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      const { resetToken, password } = resetPasswordDto;
      const currentDateObj = new Date();
      const user: User = await this.userModel.findOne({ resetToken });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.resetToken) {
        throw new ConflictException('Invalid reset token');
      }

      const passwordExpiresAt = user.passwordResetTokenExpiresAt;

      // Check if reset link has expired
      if (currentDateObj > passwordExpiresAt) {
        throw new ConflictException('Reset token has expired');
      }

      // Update Password
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
      user.resetToken = null;
      user.passwordResetTokenExpiresAt = null;
      await user.save();

      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Failed to reset password');
    }
  }
}
