import type { NotificationKind } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface NotificationDocument {
  _id: Types.ObjectId;
  recipientEmployeeId: Types.ObjectId;
  kind: NotificationKind;
  entityType: 'leave';
  entityId: Types.ObjectId;
  dedupeKey: string;
  title: string;
  message: string;
  href: string;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    recipientEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    kind: {
      type: String,
      enum: ['leave_approval_required', 'leave_approved', 'leave_rejected'],
      required: true,
    },
    entityType: { type: String, enum: ['leave'], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    dedupeKey: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    href: { type: String, required: true, trim: true, maxlength: 200 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientEmployeeId: 1, readAt: 1, createdAt: -1 });

export const Notification = model<NotificationDocument>('Notification', notificationSchema);
