import { model, Schema, Types } from 'mongoose';

export interface TimeEntryDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  workDate: string;
  showId: Types.ObjectId;
  workSessionId: Types.ObjectId | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number;
  comment: string;
  percentage: number;
  /** Set when the record came from an external file import (re-imports update it). */
  importRef: { source: string; recordId: string; fileName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const timeEntrySchema = new Schema<TimeEntryDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    showId: { type: Schema.Types.ObjectId, ref: 'Show', required: true },
    workSessionId: { type: Schema.Types.ObjectId, ref: 'WorkSession', default: null },
    // Legacy: older entries recorded a clock window. New entries only record hours.
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationMinutes: { type: Number, required: true, min: 1, max: 1_440 },
    comment: { type: String, default: '', trim: true, maxlength: 500 },
    percentage: { type: Number, required: true, default: 100, min: 10, max: 100 },
    importRef: {
      type: new Schema(
        {
          source: { type: String, required: true },
          recordId: { type: String, required: true },
          fileName: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

timeEntrySchema.index({ employeeId: 1, workDate: 1, createdAt: 1 });
timeEntrySchema.index({ showId: 1, workDate: 1 });
timeEntrySchema.index({ 'importRef.source': 1, 'importRef.recordId': 1 }, { sparse: true });

export const TimeEntry = model<TimeEntryDocument>('TimeEntry', timeEntrySchema);
