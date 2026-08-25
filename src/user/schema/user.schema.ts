import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: true })
class Experience {
  @Prop({ required: true }) company: string;
  @Prop({ required: true }) role: string;
  @Prop() location: string;
  @Prop() startDate: string;
  @Prop() endDate: string;
  @Prop([String]) highlights: string[];
  @Prop([String]) technologiesUsed: string[];
}

@Schema({ _id: false })
class Project {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) description: string;
  @Prop() url: string;
  @Prop([String]) techStack: string[];
  @Prop([String]) highlights: string[];
  @Prop() problem: string;
  @Prop() company: string;
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true }) fullName: string;
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;
  @Prop({ enum: ['user', 'admin'], default: 'user' }) role: string;
  @Prop({ default: 0 }) credits: number;
  @Prop({ required: true, minlength: 60, select: false }) password: string;
  @Prop({ default: false }) isEmailVerified: boolean;
  @Prop({ select: false }) emailVerificationToken: string;
  @Prop() emailVerificationExpiresAt: Date;

  @Prop({ default: 0 }) failedLoginAttempts: number;
  @Prop() lockedUntil: Date;

  @Prop({ select: false }) resetToken: string;
  @Prop() passwordResetTokenExpiresAt: Date;
  @Prop() phoneNumber: string;
  @Prop() linkedinUrl: string;
  @Prop() githubUrl: string;
  @Prop() portfolioUrl: string;
  @Prop() summary: string;
  @Prop({ type: [Experience] }) workExperience: Experience[];
  @Prop([String]) skills: string[];
  @Prop([{ degree: String, school: String, year: String }])
  education: { degree: string; school: string; year: string }[];
  @Prop([{ title: String, issuer: String, date: String }])
  certifications: { title: string; issuer: string; date: string }[];
  @Prop({ type: [Project] }) projects: Project[];
  @Prop([{ language: String, proficiency: String }])
  languages: { language: string; proficiency: string }[];
  @Prop([
    {
      title: String,
      issuer: String,
      date: String,
      description: { type: String },
    },
  ])
  awards: {
    title: string;
    issuer: string;
    date: string;
    description?: string;
  }[];
  @Prop([
    {
      organization: String,
      role: String,
      startDate: String,
      endDate: String,
      description: String,
    },
  ])
  volunteerWork: {
    organization: string;
    role: string;
    startDate: string;
    endDate: string;
    description: string;
  }[];
  @Prop({ default: true }) isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ emailVerificationToken: 1 });
UserSchema.index({ resetToken: 1 });
