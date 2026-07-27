import type { HolidayScopeType } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface HolidayDocument {
  _id: Types.ObjectId;
  date: string;
  name: string;
  scopeType: HolidayScopeType;
  locationId: Types.ObjectId | null;
  status: 'active' | 'archived';
  createdByUserId: Types.ObjectId;
  updatedByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<HolidayDocument>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    scopeType: { type: String, enum: ['company', 'location'], required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    status: { type: String, enum: ['active', 'archived'], required: true, default: 'active' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

holidaySchema.index({ date: 1, scopeType: 1, locationId: 1 }, { unique: true });
holidaySchema.index({ status: 1, date: 1, scopeType: 1, locationId: 1 });

export const Holiday = model<HolidayDocument>('Holiday', holidaySchema);
