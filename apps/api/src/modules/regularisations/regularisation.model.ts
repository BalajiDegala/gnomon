import type { MissingEvent, RegularisationSource, RegularisationStatus } from '@gnomon/shared';
import { model, Schema, Types, type HydratedDocument } from 'mongoose';

export type RegularisationActorRole =
  'reporting_manager' | 'hr' | 'attendance_admin' | 'system_admin';

export interface RegularisationDecisionDocument {
  step: 1 | 2;
  decision: 'approved' | 'rejected';
  actorUserId: Types.ObjectId;
  actorEmployeeId: Types.ObjectId;
  actorDisplayName: string;
  actorRole: RegularisationActorRole;
  comment: string;
  decidedAt: Date;
}

export interface RegularisationRequestDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerEmployeeId: Types.ObjectId;
  workDate: string;
  source: RegularisationSource;
  missingEvent: MissingEvent;
  requestedStart: Date;
  requestedEnd: Date;
  requestedMinutes: number;
  reason: string;
  status: RegularisationStatus;
  currentStep: 1 | 2 | 3;
  approvalPolicyVersion: string;
  deduplicationKey: string | null;
  decisions: RegularisationDecisionDocument[];
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RegularisationRequestRecord = HydratedDocument<RegularisationRequestDocument>;

const decisionSchema = new Schema<RegularisationDecisionDocument>(
  {
    step: { type: Number, enum: [1, 2], required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    actorDisplayName: { type: String, required: true, trim: true },
    actorRole: {
      type: String,
      enum: ['reporting_manager', 'hr', 'attendance_admin', 'system_admin'],
      required: true,
    },
    comment: { type: String, default: '', trim: true, maxlength: 1_000 },
    decidedAt: { type: Date, required: true },
  },
  { _id: false },
);

const regularisationRequestSchema = new Schema<RegularisationRequestDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    managerEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    source: { type: String, enum: ['biometric', 'access_card', 'website'], required: true },
    missingEvent: { type: String, enum: ['opening', 'closing', 'both'], required: true },
    requestedStart: { type: Date, required: true },
    requestedEnd: { type: Date, required: true },
    requestedMinutes: { type: Number, required: true, min: 1, max: 1_440 },
    reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 1_000 },
    status: {
      type: String,
      enum: ['pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled'],
      required: true,
      default: 'pending_manager',
    },
    currentStep: { type: Number, enum: [1, 2, 3], required: true, default: 1 },
    approvalPolicyVersion: { type: String, required: true, default: 'REGULARISATION_V1' },
    deduplicationKey: { type: String, default: null },
    decisions: { type: [decisionSchema], required: true, default: [] },
    submittedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

regularisationRequestSchema.index({ employeeId: 1, submittedAt: -1 });
regularisationRequestSchema.index({ managerEmployeeId: 1, status: 1, submittedAt: 1 });
regularisationRequestSchema.index({ status: 1, workDate: 1, submittedAt: 1 });
regularisationRequestSchema.index(
  { deduplicationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { deduplicationKey: { $type: 'string' } },
    name: 'one_active_or_approved_regularisation',
  },
);

export const RegularisationRequest = model<RegularisationRequestDocument>(
  'RegularisationRequest',
  regularisationRequestSchema,
);
