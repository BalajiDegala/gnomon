import type { WorkSessionStatus } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

interface ClientMetadata {
  ipAddress: string;
  userAgent: string;
}

export interface WorkSessionDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  workDate: string;
  startedAt: Date;
  stoppedAt: Date | null;
  durationMinutes: number | null;
  status: WorkSessionStatus;
  startMetadata: ClientMetadata;
  stopMetadata: ClientMetadata | null;
  stoppedBy: Types.ObjectId | null;
  correctionRequestId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const metadataSchema = new Schema<ClientMetadata>(
  {
    ipAddress: { type: String, required: true, maxlength: 128 },
    userAgent: { type: String, required: true, maxlength: 1_024 },
  },
  { _id: false },
);

const workSessionSchema = new Schema<WorkSessionDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startedAt: { type: Date, required: true },
    stoppedAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      enum: ['running', 'completed', 'force_stopped', 'regularised'],
      required: true,
      default: 'running',
    },
    startMetadata: { type: metadataSchema, required: true },
    stopMetadata: { type: metadataSchema, default: null },
    stoppedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    correctionRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'RegularisationRequest',
      default: null,
    },
  },
  { timestamps: true },
);

workSessionSchema.index({ employeeId: 1, workDate: 1, startedAt: 1 });
workSessionSchema.index(
  { employeeId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'running' },
    name: 'one_running_session_per_employee',
  },
);

export const WorkSession = model<WorkSessionDocument>('WorkSession', workSessionSchema);
