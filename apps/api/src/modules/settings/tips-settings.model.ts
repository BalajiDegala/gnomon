import { model, Schema, type Types } from 'mongoose';

export interface TipsSettingsDocument {
  _id: Types.ObjectId;
  /** Singleton key; there is exactly one tips configuration. */
  key: 'tips';
  enabled: boolean;
  intervalMinutes: number;
  displaySeconds: number;
  updatedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const tipsSettingsSchema = new Schema<TipsSettingsDocument>(
  {
    key: { type: String, enum: ['tips'], required: true, default: 'tips', unique: true },
    enabled: { type: Boolean, required: true, default: true },
    intervalMinutes: { type: Number, required: true, min: 30, max: 480, default: 120 },
    displaySeconds: { type: Number, required: true, min: 10, max: 120, default: 30 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const TipsSettings = model<TipsSettingsDocument>('TipsSettings', tipsSettingsSchema);
