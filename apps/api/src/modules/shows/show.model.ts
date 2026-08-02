import type { ShowStatus } from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface ShowDocument {
  _id: Types.ObjectId;
  code: string;
  name: string;
  status: ShowStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const showSchema = new Schema<ShowDocument>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    status: {
      type: String,
      enum: ['active', 'on_hold', 'completed', 'archived'],
      required: true,
      default: 'active',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

showSchema.index({ status: 1, name: 1 });

export const Show = model<ShowDocument>('Show', showSchema);

export interface ShowAssignmentDocument {
  _id: Types.ObjectId;
  showId: Types.ObjectId;
  employeeId: Types.ObjectId;
  status: 'active' | 'inactive';
  activeFrom: Date;
  activeUntil: Date | null;
  assignedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const showAssignmentSchema = new Schema<ShowAssignmentDocument>(
  {
    showId: { type: Schema.Types.ObjectId, ref: 'Show', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    status: { type: String, enum: ['active', 'inactive'], required: true, default: 'active' },
    activeFrom: { type: Date, required: true, default: Date.now },
    activeUntil: { type: Date, default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

showAssignmentSchema.index({ showId: 1, employeeId: 1 }, { unique: true });
showAssignmentSchema.index({ employeeId: 1, status: 1, activeFrom: 1, activeUntil: 1 });

export const ShowAssignment = model<ShowAssignmentDocument>('ShowAssignment', showAssignmentSchema);
