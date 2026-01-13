import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../schema/user.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
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
    };
  }
}
