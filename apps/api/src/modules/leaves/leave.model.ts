import type { LeaveDayPart, LeaveStatus, LeaveType } from '@gnomon/shared';
import { model, Schema, Types, type HydratedDocument } from 'mongoose';

export interface LeaveDecisionDocument {
  decision: 'approved' | 'rejected';
  actorUserId: Types.ObjectId;
  actorEmployeeId: Types.ObjectId;
  actorDisplayName: string;
  actorRole: 'reporting_manager' | 'system_admin';
  comment: string;
  decidedAt: Date;
}

export interface LeaveRequestDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerEmployeeId: Types.ObjectId;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  dayPart: LeaveDayPart;
  requestedDays: number;
  workingDates: string[];
  reservedDates: string[];
  reservationActive: boolean;
  reason: string;
  status: LeaveStatus;
  approvalPolicyVersion: string;
  decision: LeaveDecisionDocument | null;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type LeaveRequestRecord = HydratedDocument<LeaveRequestDocument>;

const decisionSchema = new Schema<LeaveDecisionDocument>(
  {
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    actorDisplayName: { type: String, required: true, trim: true },
    actorRole: {
      type: String,
      enum: ['reporting_manager', 'system_admin'],
      required: true,
    },
    comment: { type: String, default: '', trim: true, maxlength: 1_000 },
    decidedAt: { type: Date, required: true },
  },
  { _id: false },
);

const leaveRequestSchema = new Schema<LeaveRequestDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    managerEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType: {
      type: String,
      enum: ['casual', 'sick', 'earned', 'unpaid'],
      required: true,
    },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    dayPart: {
      type: String,
      enum: ['full_day', 'first_half', 'second_half'],
      required: true,
    },
    requestedDays: { type: Number, required: true, min: 0.5, max: 45 },
    workingDates: [{ type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }],
    reservedDates: [{ type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }],
    reservationActive: { type: Boolean, required: true, default: true },
    reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 1_000 },
    status: {
      type: String,
      enum: ['pending_manager', 'approved', 'rejected', 'cancelled'],
      required: true,
      default: 'pending_manager',
    },
    approvalPolicyVersion: { type: String, required: true, default: 'LEAVE_V1' },
    decision: { type: decisionSchema, default: null },
    submittedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

leaveRequestSchema.index({ employeeId: 1, submittedAt: -1 });
leaveRequestSchema.index({ managerEmployeeId: 1, status: 1, submittedAt: 1 });
leaveRequestSchema.index({ employeeId: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index(
  { employeeId: 1, reservedDates: 1 },
  {
    unique: true,
    partialFilterExpression: { reservationActive: true },
    name: 'one_active_leave_per_employee_date',
  },
);

export const LeaveRequest = model<LeaveRequestDocument>('LeaveRequest', leaveRequestSchema);

export interface LeaveBalanceDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  leaveType: Exclude<LeaveType, 'unpaid'>;
  year: number;
  entitledDays: number;
  adjustedDays: number;
  note: string;
  updatedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const leaveBalanceSchema = new Schema<LeaveBalanceDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType: { type: String, enum: ['casual', 'sick', 'earned'], required: true },
    year: { type: Number, required: true, min: 2000, max: 2200 },
    entitledDays: { type: Number, required: true, min: 0 },
    adjustedDays: { type: Number, required: true, default: 0 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

leaveBalanceSchema.index({ employeeId: 1, leaveType: 1, year: 1 }, { unique: true });

export const LeaveBalance = model<LeaveBalanceDocument>('LeaveBalance', leaveBalanceSchema);
