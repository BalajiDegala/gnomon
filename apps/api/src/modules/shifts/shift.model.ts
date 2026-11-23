import { model, Schema, type Types } from 'mongoose';

export interface ShiftDocument {
  _id: Types.ObjectId;
  name: string;
  nameKey: string;
  startTime: string;
  endTime: string;
  isDefault: boolean;
  active: boolean;
  updatedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSchema = new Schema<ShiftDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameKey: { type: String, required: true, lowercase: true, trim: true, maxlength: 60 },
    startTime: { type: String, required: true, match: timeOfDay },
    endTime: { type: String, required: true, match: timeOfDay },
    isDefault: { type: Boolean, required: true, default: false },
    active: { type: Boolean, required: true, default: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

shiftSchema.index({ nameKey: 1 }, { unique: true });
shiftSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: 'one_default_shift' },
);

export const Shift = model<ShiftDocument>('Shift', shiftSchema);
