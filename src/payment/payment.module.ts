import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/user/schema/user.schema';
import { Transaction, TransactionSchema } from './schema/transaction.schema';
import { PaymentController } from './controller/payment.controller';
import { PaymentService } from './service/payment.service';
import { LemonSqueezyService } from './service/lemonsqueezy.service';
import { PaystackService } from './service/paystack.service';
import { CreditPlan, CreditPlanSchema } from './schema/credit-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: CreditPlan.name, schema: CreditPlanSchema },
    ]),
  ],
  controllers: [PaymentController],
  providers: [PaymentService, LemonSqueezyService, PaystackService],
  exports: [PaymentService],
})
export class PaymentModule {}
