import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ApplicationHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  jobTitle: string;

  @Prop({ required: true })
  companyName: string;

  @Prop({ required: true })
  rawJobDescription: string;

  @Prop({ required: true, unique: true, index: true })
  jdHash: string;

  @Prop({ type: Object, required: true })
  generatedCvData: {
    professionalSummary: string;
    refinedExperience: Array<{
      role: string;
      company: string;
      highlights: string[];
    }>;
    relevantSkills: string[];
  };

  @Prop({ required: true })
  generatedCoverLetter: string;

  @Prop({ default: 'standard-chronological' })
  templateId: string;

  @Prop({ default: 'generated' })
  status: string;

  @Prop()
  lastEditedAt: Date;
}

export const ApplicationHistorySchema =
  SchemaFactory.createForClass(ApplicationHistory);

ApplicationHistorySchema.index({ user: 1, jdHash: 1 });
