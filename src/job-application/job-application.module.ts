import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ApplicationHistory,
  ApplicationHistorySchema,
} from './schema/application-history.schema';
import { ApplicationController } from './controller/application.controller';
import { ApplicationService } from './service/application.service';
import { OpenAIService } from './service/openai.service';
import { PdfService } from './service/pdf.service';
import { UserModule } from 'src/user/user.module';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { PaymentModule } from 'src/payment/payment.module';
import { JdMatchingService } from './service/Jdmatching.service';
import { SignedDownloadService } from 'src/security/services/signed-download.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApplicationHistory.name, schema: ApplicationHistorySchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => UserModule),
    PaymentModule,
  ],
  controllers: [ApplicationController],
  providers: [
    ApplicationService,
    OpenAIService,
    PdfService,
    JdMatchingService,
    SignedDownloadService,
  ],
  exports: [OpenAIService],
})
export class JobApplicationModule {}
