import { model, Schema, Types } from 'mongoose';

export interface AnnouncementDocument {
  _id: Types.ObjectId;
  title: string;
  message: string;
  audienceType: 'all' | 'departments';
  /** Department names as chosen by the sender (empty for everyone). */
  departments: string[];
  senderEmployeeId: Types.ObjectId;
  senderName: string;
  /** Snapshot of who received it, taken when it was sent. */
  recipientEmployeeIds: Types.ObjectId[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<AnnouncementDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2_000 },
    audienceType: { type: String, enum: ['all', 'departments'], required: true },
    departments: [{ type: String, trim: true }],
    senderEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    senderName: { type: String, required: true, trim: true },
    recipientEmployeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

announcementSchema.index({ recipientEmployeeIds: 1, expiresAt: -1 });
announcementSchema.index({ senderEmployeeId: 1, expiresAt: -1 });

export const Announcement = model<AnnouncementDocument>('Announcement', announcementSchema);
