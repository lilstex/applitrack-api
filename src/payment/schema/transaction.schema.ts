import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop()
  amount: number;

  @Prop()
  credits: number;

  @Prop()
  type: 'purchase' | 'usage';

  @Prop()
  description: string;

  @Prop()
  providerReference: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
