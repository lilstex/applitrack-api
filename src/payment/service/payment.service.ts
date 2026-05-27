import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction } from '../schema/transaction.schema';
import { User } from 'src/user/schema/user.schema';
import { CreateCreditPlanDto, UpdateCreditPlanDto } from '../dto/payment.dto';
import { CreditPlan } from '../schema/credit-plan.schema';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(CreditPlan.name) private planModel: Model<CreditPlan>,
  ) {}

  async createTransaction(
    userId: string,
    companyName: string,
  ): Promise<Transaction> {
    const COST_PER_CV = process.env.COST_PER_CV
      ? parseInt(process.env.COST_PER_CV, 10)
      : 10;
    return await this.transactionModel.create({
      user: userId,
      credits: COST_PER_CV,
      type: 'usage',
      description: `Optimized CV for ${companyName}`,
    });
  }

  async getUserTransactions(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: 'purchase' | 'usage';
    } = {},
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { user: userId };
    if (options.type === 'purchase' || options.type === 'usage') {
      filter.type = options.type;
    }

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async getUserTransactionById(userId: string, transactionId: string) {
    return this.transactionModel
      .findOne({ _id: transactionId, user: userId })
      .lean();
  }

  async fulfillOrder(
    userId: string,
    amount: number,
    creditsToRecord: number,
    providerReference: string,
    gateway: 'lemonsqueezy' | 'paystack',
  ) {
    // Idempotency check (ignore duplicate webhooks)
    const existingTransaction = await this.transactionModel.findOne({
      providerReference,
    });

    if (existingTransaction) {
      this.logger.warn(
        `Duplicate webhook received for ${gateway} ref: ${providerReference}`,
      );
      return;
    }

    // Atomically increment credits
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { credits: creditsToRecord } },
      { new: true },
    );

    if (!user) {
      this.logger.error(
        `User ${userId} not found during ${gateway} fulfillment`,
      );
      return;
    }

    // Record the purchase transaction for audit trail
    await this.transactionModel.create({
      user: userId,
      amount,
      credits: creditsToRecord,
      type: 'purchase',
      providerReference,
      description: `Purchased ${creditsToRecord} credits via ${gateway}`,
    });

    this.logger.log(
      `Successfully credited ${creditsToRecord} credits to User: ${userId} via ${gateway}`,
    );
  }

  async createPlan(dto: CreateCreditPlanDto) {
    return new this.planModel(dto).save();
  }

  async findAllPlans() {
    return this.planModel.find({ isActive: true }).sort({ credits: 1 });
  }

  async updatePlan(id: string, dto: UpdateCreditPlanDto) {
    const plan = await this.planModel.findByIdAndUpdate(id, dto, { new: true });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async deletePlan(id: string) {
    const result = await this.planModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Plan not found');
    return { success: true };
  }

  async getPlanBySlug(slug: string) {
    const plan = await this.planModel.findOne({ slug, isActive: true });
    if (!plan)
      throw new BadRequestException('Invalid or inactive plan selected');
    return plan;
  }
}
