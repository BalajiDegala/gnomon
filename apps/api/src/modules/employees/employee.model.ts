import { model, Schema, Types, type HydratedDocument } from 'mongoose';

export interface EmployeeDocument {
  _id: Types.ObjectId;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
  reportingManagerId: Types.ObjectId | null;
  departmentId: Types.ObjectId | null;
  locationId: Types.ObjectId | null;
  attendanceIdentity?: {
    source: 'door_workbook';
    personnelId: string;
    cardNumber: string | null;
    departmentName: string | null;
    lastSeenAt: Date;
  } | null;
  profileSource: 'users_csv' | 'door_workbook' | 'biometric_csv' | 'manual' | 'system';
  biometricProfile?: {
    fullName: string;
    departmentName: string | null;
    designation: string | null;
    companyName: string | null;
    importedAt: Date;
  } | null;
  hrProfile?: {
    source: 'users_csv';
    userId: string;
    mailId: string;
    fullName: string;
    designation: string;
    departmentName: string;
    leaveApprover1Name: string | null;
    leaveApprover2Name: string | null;
    approver1EmployeeId: Types.ObjectId | null;
    approver2EmployeeId: Types.ObjectId | null;
    emailTriggers: string[];
    importedAt: Date;
  } | null;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export type EmployeeRecord = HydratedDocument<EmployeeDocument>;

const attendanceIdentitySchema = new Schema(
  {
    source: { type: String, enum: ['door_workbook'], required: true },
    personnelId: { type: String, required: true, trim: true },
    cardNumber: { type: String, default: null, trim: true },
    departmentName: { type: String, default: null, trim: true },
    lastSeenAt: { type: Date, required: true },
  },
  { _id: false },
);

const hrProfileSchema = new Schema(
  {
    source: { type: String, enum: ['users_csv'], required: true },
    userId: { type: String, required: true, trim: true, lowercase: true },
    mailId: { type: String, required: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    departmentName: { type: String, required: true, trim: true },
    leaveApprover1Name: { type: String, default: null, trim: true },
    leaveApprover2Name: { type: String, default: null, trim: true },
    approver1EmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    approver2EmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    emailTriggers: [{ type: String, required: true, trim: true, lowercase: true }],
    importedAt: { type: Date, required: true },
  },
  { _id: false },
);

const employeeSchema = new Schema<EmployeeDocument>(
  {
    employeeCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    reportingManagerId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    attendanceIdentity: {
      type: attendanceIdentitySchema,
      default: null,
    },
    profileSource: {
      type: String,
      enum: ['users_csv', 'door_workbook', 'biometric_csv', 'manual', 'system'],
      required: true,
      default: 'manual',
    },
    hrProfile: { type: hrProfileSchema, default: null },
    biometricProfile: {
      type: new Schema(
        {
          fullName: { type: String, required: true, trim: true },
          departmentName: { type: String, default: null, trim: true },
          designation: { type: String, default: null, trim: true },
          companyName: { type: String, default: null, trim: true },
          importedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);

employeeSchema.index({ reportingManagerId: 1, status: 1 });
employeeSchema.index({ 'hrProfile.userId': 1 }, { sparse: true });
employeeSchema.index({ 'hrProfile.departmentName': 1, status: 1 });
employeeSchema.index({ 'attendanceIdentity.personnelId': 1 }, { unique: true, sparse: true });

export const Employee = model<EmployeeDocument>('Employee', employeeSchema);
