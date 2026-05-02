import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './controller/admin.controller';
import { AdminService } from './service/admin.service';
import { User, UserSchema } from 'src/user/schema/user.schema';
import {
  ApplicationHistory,
  ApplicationHistorySchema,
} from 'src/job-application/schema/application-history.schema';
import { Transaction, TransactionSchema } from 'src/payment/schema/transaction.schema';
import { CreditPlan, CreditPlanSchema } from 'src/payment/schema/credit-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: CreditPlan.name, schema: CreditPlanSchema },
      { name: ApplicationHistory.name, schema: ApplicationHistorySchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}