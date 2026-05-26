import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from 'src/user/schema/user.schema';
import { ApplicationHistory } from 'src/job-application/schema/application-history.schema';
import { Transaction } from 'src/payment/schema/transaction.schema';
import { CreditPlan } from 'src/payment/schema/credit-plan.schema';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeSearchString(input: unknown, maxLen = 100): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(CreditPlan.name) private creditPlanModel: Model<CreditPlan>,
    @InjectModel(ApplicationHistory.name)
    private applicationModel: Model<ApplicationHistory>,
  ) {}

  async getDashboard() {
    try {
      const [totalUsers, revenueResult, creditsUsedResult, totalApplications] =
        await Promise.all([
          this.userModel.countDocuments(),
          this.transactionModel.aggregate([
            { $match: { type: 'purchase' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
          this.transactionModel.aggregate([
            { $match: { type: 'usage' } },
            { $group: { _id: null, total: { $sum: '$credits' } } },
          ]),
          this.applicationModel.countDocuments(),
        ]);

      return {
        totalUsers,
        totalRevenue: revenueResult[0]?.total || 0,
        totalCreditsUsed: creditsUsedResult[0]?.total || 0,
        totalApplications,
      };
    } catch (error) {
      this.logger.error('Failed to fetch dashboard', error);
      throw new InternalServerErrorException('Failed to fetch dashboard');
    }
  }

  async getUsers(query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {};

    const search = safeSearchString(query.search);
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { fullName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (query.role === 'admin' || query.role === 'user') {
      filter.role = query.role;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.userModel.countDocuments(filter),
    ]);

    return { users, total, page, limit };
  }

  async updateUserRole(userId: string, role: string) {
    if (role !== 'user' && role !== 'admin') {
      throw new InternalServerErrorException('Invalid role');
    }
    const user = await this.userModel
      .findByIdAndUpdate(userId, { role }, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserCredits(userId: string, credits: number) {
    const safe = Math.max(0, Math.floor(Number(credits) || 0));
    const user = await this.userModel
      .findByIdAndUpdate(userId, { credits: safe }, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async toggleUser(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !user.isActive;
    return user.save();
  }

  async createPlan(data: any) {
    return this.creditPlanModel.create(data);
  }

  async updatePlan(id: string, data: any) {
    const plan = await this.creditPlanModel.findByIdAndUpdate(id, data, {
      new: true,
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async togglePlan(id: string) {
    const plan = await this.creditPlanModel.findById(id);
    if (!plan) throw new NotFoundException('Plan not found');
    plan.isActive = !plan.isActive;
    return plan.save();
  }

  async getPlans() {
    return this.creditPlanModel.find().sort({ createdAt: -1 });
  }

  async getTransactions(query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.type === 'purchase' || query.type === 'usage') {
      filter.type = query.type;
    }

    const search = safeSearchString(query.search);
    if (search) {
      const escaped = escapeRegex(search);
      const re = new RegExp(escaped, 'i');

      const matchedUserIds = (
        await this.userModel
          .find({ $or: [{ fullName: re }, { email: re }] })
          .select('_id')
          .lean()
      ).map((u) => u._id);

      filter.$or = [
        { user: { $in: matchedUserIds } },
        { providerReference: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .populate('user', 'email fullName')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.transactionModel.countDocuments(filter),
    ]);

    return { transactions, total, page, limit };
  }

  async getApplications(query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {};

    const status = safeSearchString(query.status, 32);
    if (status) filter.status = status;

    const search = safeSearchString(query.search);
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { jobTitle: { $regex: escaped, $options: 'i' } },
        { companyName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [applications, total] = await Promise.all([
      this.applicationModel
        .find(filter)
        .populate('user', 'email fullName')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.applicationModel.countDocuments(filter),
    ]);

    return { applications, total, page, limit };
  }
}
