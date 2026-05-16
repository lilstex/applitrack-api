import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from 'src/user/schema/user.schema';
import { ApplicationHistory } from 'src/job-application/schema/application-history.schema';
import { Transaction } from 'src/payment/schema/transaction.schema';
import { CreditPlan } from 'src/payment/schema/credit-plan.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(CreditPlan.name) private creditPlanModel: Model<CreditPlan>,
    @InjectModel(ApplicationHistory.name) private applicationModel: Model<ApplicationHistory>,
  ) {}

  // ================= DASHBOARD =================
  async getDashboard() {
    try {
      const [totalUsers, revenueResult, creditsUsedResult, totalApplications] = await Promise.all([
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
      console.log(error);
      throw new InternalServerErrorException('Failed to fetch dashboard');
    }
  }

  // ================= USERS =================
  async getUsers(query: any) {
    const { page = 1, limit = 10, search, role } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    const users = await this.userModel
      .find(filter)
      .select('-password')
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await this.userModel.countDocuments(filter);

    return { users, total, page: Number(page), limit: Number(limit) };
  }

  async updateUserRole(userId: string, role: string) {
    const user = await this.userModel.findByIdAndUpdate(userId, { role }, { new: true }).select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserCredits(userId: string, credits: number) {
    const user = await this.userModel.findByIdAndUpdate(userId, { credits }, { new: true }).select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async toggleUser(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !user.isActive;
    return user.save();
  }

  // ================= CREDIT PLANS =================
  async createPlan(data: any) {
    return this.creditPlanModel.create(data);
  }

  async updatePlan(id: string, data: any) {
    const plan = await this.creditPlanModel.findByIdAndUpdate(id, data, { new: true });
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

  // ================= TRANSACTIONS =================
  async getTransactions(query: any) {
    const { page = 1, limit = 10, type, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (type) filter.type = type;

    let transactions = await this.transactionModel
      .find(filter)
      .populate('user', 'email fullName')
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    // Post-populate search filter on user fields or reference
    if (search) {
      const s = search.toLowerCase();
      transactions = transactions.filter((tx: any) => {
        const user = tx.user as any;
        return (
          user?.fullName?.toLowerCase().includes(s) ||
          user?.email?.toLowerCase().includes(s) ||
          tx.providerReference?.toLowerCase().includes(s)
        );
      });
    }

    const total = await this.transactionModel.countDocuments(filter);

    return { transactions, total, page: Number(page), limit: Number(limit) };
  }

  // ================= APPLICATIONS =================
  async getApplications(query: any) {
    const { page = 1, limit = 10, search, status } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { jobTitle: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
      ];
    }

    const applications = await this.applicationModel
      .find(filter)
      .populate('user', 'email fullName')
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await this.applicationModel.countDocuments(filter);

    return { applications, total, page: Number(page), limit: Number(limit) };
  }
}
