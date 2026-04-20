import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class CreditPlan extends Document {
  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  credits: number;

  @Prop({ required: true })
  priceNgn: number;

  @Prop({ required: true })
  priceUsd: number;

  @Prop({ required: true })
  lemonSqueezyVariantId: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const CreditPlanSchema = SchemaFactory.createForClass(CreditPlan);
