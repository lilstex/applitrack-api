import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { JobApplicationModule } from './job-application/job-application.module';
import { UserModule } from './user/user.module';
import * as Joi from 'joi';
import { PaymentModule } from './payment/payment.module';
import { AdminModule } from './admin/admin.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './security/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'staging', 'production')
          .default('development'),
        DATABASE_URI: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        TOKEN_VALIDATION_DURATION: Joi.string().required(),
        FRONTEND_URL: Joi.string().uri().required(),
        CORS_ORIGINS: Joi.string().required(),
        TURNSTILE_SECRET_KEY: Joi.string().required(),
        COOKIE_DOMAIN: Joi.string().optional(),
        THROTTLE_TTL_MS: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(60),
      }),
      isGlobal: true,
    }),
    // Three-tier throttler: short burst, per-minute, per-hour
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'short', ttl: 1000, limit: 5 },
        {
          name: 'medium',
          ttl: 60000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 60,
        },
        { name: 'long', ttl: 3600000, limit: 500 },
      ],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): MongooseModuleOptions => ({
        uri: configService.get<string>('DATABASE_URI'),
      }),
    }),
    UserModule,
    JobApplicationModule,
    PaymentModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
