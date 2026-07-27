import type { TimeEntryStatus } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface TimeEntryDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  workDate: string;
  showId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  taskId: Types.ObjectId;
  workSessionId: Types.ObjectId | null;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  description: string;
  billable: boolean;
  status: TimeEntryStatus;
  approval: {
    policyId: Types.ObjectId | null;
    currentStep: number;
    assignedApproverIds: Types.ObjectId[];
    approvedBy: Types.ObjectId | null;
    approvedAt: Date | null;
    rejectionReason: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const approvalSchema = new Schema<TimeEntryDocument['approval']>(
  {
    policyId: { type: Schema.Types.ObjectId, ref: 'ApprovalPolicy', default: null },
    currentStep: { type: Number, required: true, min: 0, default: 0 },
    assignedApproverIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 1_000 },
  },
  { _id: false },
);

const timeEntrySchema = new Schema<TimeEntryDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    showId: { type: Schema.Types.ObjectId, ref: 'Show', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    workSessionId: { type: Schema.Types.ObjectId, ref: 'WorkSession', default: null },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 1_440 },
    description: { type: String, required: true, trim: true, minlength: 3, maxlength: 1_000 },
    billable: { type: Boolean, required: true, default: true },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      required: true,
      default: 'draft',
    },
    approval: { type: approvalSchema, required: true, default: () => ({}) },
  },
  { timestamps: true },
);

timeEntrySchema.index({ employeeId: 1, workDate: 1, startedAt: 1 });
timeEntrySchema.index({ showId: 1, status: 1, workDate: 1 });
timeEntrySchema.index({ taskId: 1, workDate: 1 });

export const TimeEntry = model<TimeEntryDocument>('TimeEntry', timeEntrySchema);
