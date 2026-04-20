import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schema/user.schema';
import { ExperienceDto, UpdateBasicInfoDto } from '../dto/profile.dto';
import { ChangePasswordDto } from '../dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ProfileService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async getProfile(userId: string): Promise<User> {
    const profile = await this.userModel.findById(userId);
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async updateBasicInfo(userId: string, updateData: UpdateBasicInfoDto) {
    try {
      return this.userModel.findByIdAndUpdate(userId, updateData, {
        new: true,
      });
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Server Erroor');
    }
  }

  async addExperience(userId: string, experience: ExperienceDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Push the new item
    user.workExperience.push(experience as any);

    // Sort the actual Mongoose array
    user.workExperience.sort((a, b) => this.compareDates(a.endDate, b.endDate));

    // Tell Mongoose the array structure/order has changed
    user.markModified('workExperience');

    return user.save();
  }

  async updateExperience(
    userId: string,
    expId: string,
    updateData: ExperienceDto,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const experience = (user.workExperience as any).id(expId);

    if (!experience) throw new NotFoundException('Experience record not found');

    // Update the subdocument fields directly
    experience.set(updateData);

    // Re-sort the array
    user.workExperience.sort((a, b) => this.compareDates(a.endDate, b.endDate));

    user.markModified('workExperience');
    return user.save();
  }

  async updateProfile(userId: string, updateData: UpdateBasicInfoDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Handle Work Experience Sorting if AI returns unsorted data
    if (updateData.workExperience && updateData.workExperience.length > 0) {
      updateData.workExperience.sort((a, b) =>
        this.compareDates(a.endDate, b.endDate),
      );
    }

    // Update only fields that have values
    Object.keys(updateData).forEach((key) => {
      const value = updateData[key];

      // For arrays, only update if it's a non-empty array
      if (Array.isArray(value)) {
        if (value.length > 0) {
          user[key] = value;
        }
      }
      // For objects and strings, update if truthy (not null/undefined/empty string)
      else if (value !== undefined && value !== null && value !== '') {
        user[key] = value;
      }
    });

    return user.save();
  }

  async removeExperience(userId: string, expId: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { workExperience: { _id: expId } } },
      { new: true },
    );
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    try {
      const { newPassword, currentPassword } = changePasswordDto;
      const user: User = await this.userModel.findById(userId).exec();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Validate password
      const isPasswordMatched = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isPasswordMatched) {
        throw new ConflictException('Invalid current password');
      }

      // Update Password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.resetToken = null;
      user.passwordResetTokenExpiresAt = null;
      await user.save();

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Failed to change password');
    }
  }

  private compareDates(dateA: string, dateB: string): number {
    const getTime = (dateStr: string | undefined): number => {
      // Handle "Present" - treat it as the highest possible timestamp
      if (!dateStr || dateStr.toLowerCase().trim() === 'present') {
        return Date.now();
      }

      // Standard ISO strings (2023-11-01)
      const time = new Date(dateStr).getTime();

      // Fallback for unparseable dates
      return isNaN(time) ? 0 : time;
    };

    // Return B - A for Reverse Chronological (Descending)
    return getTime(dateB) - getTime(dateA);
  }
}
