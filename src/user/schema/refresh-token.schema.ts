import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'refresh_tokens' })
export class RefreshToken extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) tokenHash: string;
  @Prop({ required: true, index: true }) family: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() revokedAt: Date | null;
  @Prop() replacedBy: string | null;
  @Prop() userAgent: string;
  @Prop() ip: string;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
