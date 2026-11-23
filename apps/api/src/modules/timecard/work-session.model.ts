import type { WorkMode, WorkSessionStatus } from '@gnomon/shared';
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
  /** Shift snapshot taken at start so later shift edits do not rewrite history. */
  shiftId: Types.ObjectId | null;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  workMode: WorkMode | null;
  /** Set when the record came from an external file import (re-imports update it). */
  importRef: { source: string; recordId: string; fileName: string } | null;
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
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null },
    shiftName: { type: String, default: null, maxlength: 60 },
    shiftStartTime: { type: String, default: null },
    shiftEndTime: { type: String, default: null },
    workMode: { type: String, enum: ['office', 'home', null], default: null },
    importRef: {
      type: new Schema(
        {
          source: { type: String, required: true },
          recordId: { type: String, required: true },
          fileName: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

workSessionSchema.index({ employeeId: 1, workDate: 1, startedAt: 1 });
workSessionSchema.index({ 'importRef.source': 1, 'importRef.recordId': 1 }, { sparse: true });
workSessionSchema.index(
  { employeeId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'running' },
    name: 'one_running_session_per_employee',
  },
);

export const WorkSession = model<WorkSessionDocument>('WorkSession', workSessionSchema);
