import { model, Schema, Types } from 'mongoose';

export interface LocationDocument {
  _id: Types.ObjectId;
  code: string;
  name: string;
  status: 'active' | 'inactive';
  createdByUserId: Types.ObjectId;
  updatedByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<LocationDocument>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    status: { type: String, enum: ['active', 'inactive'], required: true, default: 'active' },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

locationSchema.index({ status: 1, name: 1 });

export const Location = model<LocationDocument>('Location', locationSchema);

export interface EmployeeLocationAssignmentDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  locationId: Types.ObjectId | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  assignedByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employeeLocationAssignmentSchema = new Schema<EmployeeLocationAssignmentDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    effectiveUntil: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    assignedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

employeeLocationAssignmentSchema.index({ employeeId: 1, effectiveFrom: 1 }, { unique: true });
employeeLocationAssignmentSchema.index({ locationId: 1, effectiveFrom: 1, effectiveUntil: 1 });
employeeLocationAssignmentSchema.index(
  { employeeId: 1, effectiveUntil: 1 },
  {
    unique: true,
    partialFilterExpression: { effectiveUntil: { $type: 'null' } },
    name: 'one_current_employee_location',
  },
);

export const EmployeeLocationAssignment = model<EmployeeLocationAssignmentDocument>(
  'EmployeeLocationAssignment',
  employeeLocationAssignmentSchema,
);
