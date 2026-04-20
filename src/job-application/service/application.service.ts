import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ApplicationHistory } from '../schema/application-history.schema';
import { UpdateApplicationDto, UpdateStatusDto } from '../dto/application.dto';

@Injectable()
export class ApplicationService {
  constructor(
    @InjectModel(ApplicationHistory.name)
    private applicationModel: Model<ApplicationHistory>,
  ) {}

  generateJdHash(jobDescription: string): string {
    const normalizedJd = jobDescription
      .toLowerCase()
      .replace(/\s+/g, '') // Remove all whitespace
      .trim();

    return crypto.createHash('md5').update(normalizedJd).digest('hex');
  }

  generateProfileHash(profile: any): string {
    const relevantFields = {
      summary: profile.summary ?? '',
      workExperience: profile.workExperience ?? [],
      skills: profile.skills ?? [],
      education: profile.education ?? [],
      certifications: profile.certifications ?? [],
    };
    return crypto
      .createHash('md5')
      .update(JSON.stringify(relevantFields))
      .digest('hex');
  }

  async findExistingApplication(userId: string, jdHash: string) {
    return this.applicationModel.findOne({ user: userId, jdHash });
  }

  async saveApplication(data: any): Promise<ApplicationHistory> {
    const newApplication = new this.applicationModel(data);
    return newApplication.save();
  }

  async getById(id: string): Promise<ApplicationHistory> {
    const application = await this.applicationModel.findById(id);
    if (!application) {
      throw new NotFoundException('Application history not found');
    }
    return application;
  }

  async updateApplication(
    id: string,
    userId: string,
    updateDto: UpdateApplicationDto,
  ) {
    // Fetch the application
    const application = await this.applicationModel.findById(id);

    if (!application) {
      throw new NotFoundException('Application history not found');
    }

    //Ensure the user owns this application
    if (application.user.toString() !== userId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to modify this record',
      );
    }

    const updatedApp = await this.applicationModel.findByIdAndUpdate(
      id,
      { $set: updateDto },
      { new: true },
    );

    return updatedApp;
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto) {
    const application = await this.applicationModel.findByIdAndUpdate(
      id,
      { $set: { status: updateStatusDto.status } },
      { new: true, runValidators: true },
    );

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    return application;
  }

  async deleteApplication(id: string, userId: string): Promise<void> {
    const application = await this.applicationModel.findById(id);

    if (!application) {
      throw new NotFoundException('Application history not found');
    }

    // Ensure the user owns this record
    if (application.user.toString() !== userId.toString()) {
      throw new ForbiddenException(
        'You do not have permission to delete this application',
      );
    }

    await this.applicationModel.findByIdAndDelete(id);
  }

  async getMostRecentWithCoverLetter(
    userId: string,
  ): Promise<ApplicationHistory | null> {
    return this.applicationModel
      .findOne({
        user: userId,
        generatedCoverLetter: { $exists: true, $ne: '' },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getUserApplications(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    // Execute both queries in parallel for better performance
    const [data, total] = await Promise.all([
      this.applicationModel
        .find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.applicationModel.countDocuments({ user: userId }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async processJobApplication(
    userId: string,
    jobData: { title: string; company: string; description: string },
  ): Promise<
    | { isDuplicate: true; data: ApplicationHistory; message: string }
    | { isDuplicate: false; jdHash: string }
  > {
    const jdHash = this.generateJdHash(jobData.description);
    const existing = await this.findExistingApplication(userId, jdHash);

    if (existing) {
      return {
        isDuplicate: true,
        data: existing,
        message: 'You have already generated a CV for this job description.',
      };
    }

    return { isDuplicate: false, jdHash };
  }

  /**
   * Overwrites the AI-generated fields on an existing application record.
   */
  async refreshApplicationContent(
    id: string,
    aiOutput: any,
    profileHash: string,
  ): Promise<ApplicationHistory> {
    return this.applicationModel.findByIdAndUpdate(
      id,
      {
        $set: {
          generatedCvData: aiOutput,
          generatedCoverLetter: aiOutput.coverLetter,
          profileHash,
          lastEditedAt: new Date(),
        },
      },
      { new: true },
    );
  }
}
