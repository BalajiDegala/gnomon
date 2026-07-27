import { model, Schema } from 'mongoose';

const sourceIntervalFields = {
  firstAt: { type: Date, default: null },
  lastAt: { type: Date, default: null },
  workedMinutes: { type: Number, required: true, min: 0 },
  eventCount: { type: Number, required: true, min: 0 },
};

const dailyTimecardSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    timezone: { type: String, required: true },
    window: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
      expectedStart: { type: Date, required: true },
      expectedEnd: { type: Date, required: true },
      requiredMinutes: { type: Number, required: true, min: 1 },
    },
    sourceSummary: {
      biometric: {
        ...sourceIntervalFields,
        status: {
          type: String,
          enum: ['complete', 'missing_in', 'missing_out', 'invalid', 'none'],
          required: true,
        },
      },
      accessCard: {
        ...sourceIntervalFields,
        status: {
          type: String,
          enum: ['complete', 'missing_entry', 'missing_exit', 'invalid', 'none'],
          required: true,
        },
      },
      website: {
        status: {
          type: String,
          enum: ['running', 'complete', 'incomplete', 'none'],
          required: true,
        },
        firstAt: { type: Date, default: null },
        lastAt: { type: Date, default: null },
        workedMinutes: { type: Number, required: true, min: 0 },
        sessionCount: { type: Number, required: true, min: 0 },
      },
      taskEntries: {
        totalMinutes: { type: Number, required: true, min: 0 },
        entryCount: { type: Number, required: true, min: 0 },
        draftCount: { type: Number, required: true, min: 0 },
        submittedCount: { type: Number, required: true, min: 0 },
        approvedCount: { type: Number, required: true, min: 0 },
      },
    },
    calculated: {
      primarySource: {
        type: String,
        enum: ['biometric', 'access_card', 'website', 'none'],
        required: true,
      },
      attendanceStart: { type: Date, default: null },
      attendanceEnd: { type: Date, default: null },
      grossMinutes: { type: Number, required: true, min: 0 },
      breakMinutes: { type: Number, required: true, min: 0 },
      payableMinutes: { type: Number, required: true, min: 0 },
      requiredMinutes: { type: Number, required: true, min: 1 },
      differenceMinutes: { type: Number, required: true },
      status: {
        type: String,
        enum: [
          'present',
          'partial',
          'absent',
          'leave',
          'holiday',
          'weekend',
          'pending_regularisation',
        ],
        required: true,
      },
      anomalies: [
        {
          type: String,
          enum: [
            'missing_biometric_in',
            'missing_biometric_out',
            'missing_access_entry',
            'missing_access_exit',
            'missing_web_start',
            'missing_web_stop',
            'source_time_mismatch',
            'insufficient_hours',
            'task_outside_web_session',
            'task_exceeds_presence',
            'unsubmitted_task_time',
            'invalid_event_order',
          ],
        },
      ],
      workdayClosed: { type: Boolean, required: true },
      provisional: { type: Boolean, required: true },
      requiresReview: { type: Boolean, required: true },
    },
    regularisationStatus: {
      type: String,
      enum: ['not_required', 'draft', 'pending', 'approved', 'rejected'],
      required: true,
      default: 'not_required',
    },
    finalisation: {
      isFinal: { type: Boolean, required: true, default: false },
      finalSource: {
        type: String,
        enum: ['calculated', 'regularised', 'hr_override'],
        required: true,
        default: 'calculated',
      },
      finalStart: { type: Date, default: null },
      finalEnd: { type: Date, default: null },
      finalMinutes: { type: Number, required: true, min: 0, default: 0 },
      finalisedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      finalisedAt: { type: Date, default: null },
    },
    version: { type: Number, required: true, min: 1 },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

dailyTimecardSchema.index({ employeeId: 1, workDate: 1 }, { unique: true });
dailyTimecardSchema.index({ workDate: 1, 'calculated.status': 1, 'calculated.requiresReview': 1 });

export const DailyTimecard = model('DailyTimecard', dailyTimecardSchema);
