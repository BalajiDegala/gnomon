import type { ShowStatus, TaskStatus } from '@gnomon/shared';
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

export interface TaskDocument {
  _id: Types.ObjectId;
  showId: Types.ObjectId;
  code: string;
  name: string;
  status: TaskStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDocument>(
  {
    showId: { type: Schema.Types.ObjectId, ref: 'Show', required: true },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 32 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, enum: ['active', 'inactive'], required: true, default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

taskSchema.index({ showId: 1, code: 1 }, { unique: true });
taskSchema.index({ showId: 1, status: 1, name: 1 });

export const Task = model<TaskDocument>('Task', taskSchema);

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
