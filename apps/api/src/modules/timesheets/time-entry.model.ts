import { model, Schema, Types } from 'mongoose';

export interface TimeEntryDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  workDate: string;
  showId: Types.ObjectId;
  workSessionId: Types.ObjectId | null;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  comment: string;
  percentage: number;
  createdAt: Date;
  updatedAt: Date;
}

const timeEntrySchema = new Schema<TimeEntryDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    showId: { type: Schema.Types.ObjectId, ref: 'Show', required: true },
    workSessionId: { type: Schema.Types.ObjectId, ref: 'WorkSession', default: null },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 1_440 },
    comment: { type: String, default: '', trim: true, maxlength: 500 },
    percentage: { type: Number, required: true, default: 100, min: 10, max: 100 },
  },
  { timestamps: true },
);

timeEntrySchema.index({ employeeId: 1, workDate: 1, startedAt: 1 });
timeEntrySchema.index({ showId: 1, workDate: 1 });

export const TimeEntry = model<TimeEntryDocument>('TimeEntry', timeEntrySchema);
