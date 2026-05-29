import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ApplicationHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true }) jobTitle: string;
  @Prop({ required: true }) companyName: string;
  @Prop({ required: true }) rawJobDescription: string;

  @Prop({ required: true, index: true }) jdHash: string;

  @Prop({ type: Object })
  generatedCvData: {
    professionalSummary: string;
    refinedExperience: Array<{
      role: string;
      company: string;
      startDate: string;
      endDate: string;
      highlights: string[];
    }>;
    relevantSkills: string[];
    education: Array<{ degree: string; school: string; year: string }>;
    certifications: Array<{ title: string; issuer: string; date: string }>;
    projects: Array<{
      name: string;
      description: string;
      techStack: string[];
      highlights: string[];
    }>;
    languages: Array<{ language: string; proficiency: string }>;
    awards: Array<{
      title: string;
      issuer: string;
      date: string;
      description: string;
    }>;
    volunteerWork: Array<{
      organization: string;
      role: string;
      startDate: string;
      endDate: string;
      description: string;
    }>;
  };

  @Prop() generatedCoverLetter: string;
  @Prop() generatedProposal: string;

  @Prop({ type: Object })
  proposalMetadata: {
    extractedInstructions: string[];
    questionsToAnswer: string[];
    requiredKeywords: string[];
    estimatedBudget: string | null;
    estimatedDuration: string | null;
    referencedProjects: string[];
    wordCount: number;
    instructionConfidence: 'low' | 'medium' | 'high';
  };

  @Prop() lastProposalGeneratedAt: Date;

  @Prop({ default: 'standard-chronological' }) templateId: string;
  @Prop({ default: 'generated' }) status: string;
  @Prop() lastEditedAt: Date;
  @Prop({ type: Object })
  cacheMetadata: {
    usedCache: boolean;
    confidence: number;
    matchedKeywords: string[];
  };
}

export const ApplicationHistorySchema =
  SchemaFactory.createForClass(ApplicationHistory);
ApplicationHistorySchema.index({ user: 1, jdHash: 1 });
