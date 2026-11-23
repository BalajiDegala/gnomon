import { model, Schema, Types, type HydratedDocument } from 'mongoose';

export interface DepartmentApprovalPolicyDocument {
  _id: Types.ObjectId;
  departmentName: string;
  approvalSteps: 1 | 2;
  approver1EmployeeId: Types.ObjectId | null;
  approver2EmployeeId: Types.ObjectId | null;
  approver2EmployeeIds: Types.ObjectId[];
  importedApprover1Name: string | null;
  importedApprover2Name: string | null;
  importedApprover2Names: string[];
  emailTriggers: string[];
  version: number;
  updatedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DepartmentApprovalPolicyRecord = HydratedDocument<DepartmentApprovalPolicyDocument>;

const departmentApprovalPolicySchema = new Schema<DepartmentApprovalPolicyDocument>(
  {
    departmentName: { type: String, required: true, unique: true, trim: true },
    approvalSteps: { type: Number, enum: [1, 2], required: true, default: 1 },
    approver1EmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    approver2EmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    approver2EmployeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee', required: true }],
    importedApprover1Name: { type: String, default: null, trim: true },
    importedApprover2Name: { type: String, default: null, trim: true },
    importedApprover2Names: [{ type: String, required: true, trim: true }],
    emailTriggers: [{ type: String, required: true, lowercase: true, trim: true }],
    version: { type: Number, required: true, min: 1, default: 1 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const DepartmentApprovalPolicy = model<DepartmentApprovalPolicyDocument>(
  'DepartmentApprovalPolicy',
  departmentApprovalPolicySchema,
);
