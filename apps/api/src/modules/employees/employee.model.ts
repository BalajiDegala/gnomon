import { model, Schema, Types } from 'mongoose';

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
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

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
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true },
);

employeeSchema.index({ reportingManagerId: 1, status: 1 });

export const Employee = model<EmployeeDocument>('Employee', employeeSchema);
