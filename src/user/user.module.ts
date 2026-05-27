import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schema/user.schema';
import { ProfileController } from './controller/profile.controller';
import { ProfileService } from './service/profile.service';
import { AuthService } from './service/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './controller/auth.controller';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from 'src/security/middleware/jwt.strategy';
import { JobApplicationModule } from 'src/job-application/job-application.module';
import { EmailModule } from 'src/providers/email/email.module';
import { RefreshTokenService } from './service/refresh-token.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      global: true,
      useFactory: (config: ConfigService) => {
        return {
          secret: config.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: config.get<number>('TOKEN_VALIDATION_DURATION'),
          },
        };
      },
    }),
    EmailModule,
    forwardRef(() => JobApplicationModule),
  ],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, ProfileService, JwtStrategy, RefreshTokenService],
  exports: [
    ProfileService,
    JwtStrategy,
    ProfileService,
    MongooseModule,
    RefreshTokenService,
  ],
})
export class UserModule {}
