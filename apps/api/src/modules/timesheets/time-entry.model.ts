import type { TimeEntryStatus, TimesheetDecisionActorRole } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface TimesheetDecisionDocument {
  decision: 'approved' | 'rejected';
  actorUserId: Types.ObjectId;
  actorEmployeeId: Types.ObjectId;
  actorDisplayName: string;
  actorRole: TimesheetDecisionActorRole;
  comment: string;
  decidedAt: Date;
}

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
    policyVersion: string;
    currentStep: number;
    assignedApproverIds: Types.ObjectId[];
    submittedAt: Date | null;
    approvedBy: Types.ObjectId | null;
    approvedAt: Date | null;
    rejectionReason: string | null;
    decisions: TimesheetDecisionDocument[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const decisionSchema = new Schema<TimesheetDecisionDocument>(
  {
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    actorDisplayName: { type: String, required: true, trim: true },
    actorRole: {
      type: String,
      enum: ['reporting_manager', 'show_manager', 'system_admin'],
      required: true,
    },
    comment: { type: String, default: '', trim: true, maxlength: 1_000 },
    decidedAt: { type: Date, required: true },
  },
  { _id: false },
);

const approvalSchema = new Schema<TimeEntryDocument['approval']>(
  {
    policyId: { type: Schema.Types.ObjectId, ref: 'ApprovalPolicy', default: null },
    policyVersion: { type: String, required: true, default: 'TIMESHEET_V1' },
    currentStep: { type: Number, required: true, min: 0, default: 0 },
    assignedApproverIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    submittedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 1_000 },
    decisions: { type: [decisionSchema], required: true, default: [] },
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
timeEntrySchema.index({ status: 1, 'approval.submittedAt': 1 });
timeEntrySchema.index({ taskId: 1, workDate: 1 });

export const TimeEntry = model<TimeEntryDocument>('TimeEntry', timeEntrySchema);
