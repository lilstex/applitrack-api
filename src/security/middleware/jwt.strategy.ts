import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { User } from 'src/user/schema/user.schema';

const cookieExtractor = (req: Request): string | null => {
  if (!req || !req.cookies) return null;
  return req.cookies['token'] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    const { id } = payload;
    const user: any = await this.userModel.findById(id);

    if (!user)
      throw new UnauthorizedException('Login to access this resource.');
    if (user.isActive === false) {
      throw new UnauthorizedException('Account disabled.');
    }
    return user;
  }
}
