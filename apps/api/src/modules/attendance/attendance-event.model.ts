import type { AttendanceImportSource } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export type AttendanceEventType = 'in' | 'out' | 'entry' | 'exit';

export interface AttendanceEventDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  source: AttendanceImportSource;
  eventType: AttendanceEventType;
  occurredAt: Date;
  workDate: string;
  sourceEmployeeCode: string;
  sourceEventId: string | null;
  importBatchId: Types.ObjectId;
  device: {
    deviceId: string | null;
    deviceName: string | null;
    locationId: Types.ObjectId | null;
  };
  rawPayload: Record<string, string>;
  fingerprint: string;
  isSynthetic: boolean;
  correctionRequestId: Types.ObjectId | null;
  createdAt: Date;
}

const attendanceEventSchema = new Schema<AttendanceEventDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    source: { type: String, enum: ['biometric', 'access_card'], required: true },
    eventType: { type: String, enum: ['in', 'out', 'entry', 'exit'], required: true },
    occurredAt: { type: Date, required: true },
    workDate: { type: String, required: true },
    sourceEmployeeCode: { type: String, required: true, uppercase: true, trim: true },
    sourceEventId: { type: String, default: null, trim: true },
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true },
    device: {
      deviceId: { type: String, default: null, trim: true },
      deviceName: { type: String, default: null, trim: true },
      locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    },
    rawPayload: { type: Schema.Types.Mixed, required: true },
    fingerprint: { type: String, required: true, unique: true },
    isSynthetic: { type: Boolean, required: true, default: false },
    correctionRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'RegularisationRequest',
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

attendanceEventSchema.index({ employeeId: 1, workDate: 1, source: 1, occurredAt: 1 });
attendanceEventSchema.index({ importBatchId: 1, occurredAt: 1 });

export const AttendanceEvent = model<AttendanceEventDocument>(
  'AttendanceEvent',
  attendanceEventSchema,
);
