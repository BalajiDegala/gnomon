import { z } from 'zod';

import { LeaveDayPartSchema, LeaveStatusSchema, LeaveTypeSchema } from './leave.js';
import { ShiftDtoSchema, WorkContextSchema, WorkModeSchema } from './shift.js';

export const WorkSessionStatusSchema = z.enum([
  'running',
  'completed',
  'force_stopped',
  'regularised',
]);
export type WorkSessionStatus = z.infer<typeof WorkSessionStatusSchema>;

export const WorkSessionDtoSchema = z.object({
  id: z.string(),
  workDate: z.string().date(),
  startedAt: z.string().datetime(),
  stoppedAt: z.string().datetime().nullable(),
  durationMinutes: z.number().int().nonnegative().nullable(),
  status: WorkSessionStatusSchema,
  shiftName: z.string().nullable(),
  workMode: WorkModeSchema.nullable(),
});
export type WorkSessionDto = z.infer<typeof WorkSessionDtoSchema>;

export const TodayTimecardSchema = z.object({
  workDate: z.string().date(),
  state: z.enum(['not_started', 'running', 'completed']),
  activeSession: WorkSessionDtoSchema.nullable(),
  sessions: z.array(WorkSessionDtoSchema),
  totalTrackedSeconds: z.number().int().nonnegative(),
  /** Shift/work mode chosen at the first start of this work date; locked for later sessions. */
  workContext: WorkContextSchema,
  /** Active shifts the employee can choose from, default first. */
  shifts: z.array(ShiftDtoSchema),
  serverNow: z.string().datetime(),
  /** Pending or approved leave covering this work date, so starting work can be confirmed. */
  leave: z
    .object({
      requestId: z.string(),
      leaveType: LeaveTypeSchema,
      dayPart: LeaveDayPartSchema,
      status: LeaveStatusSchema,
    })
    .nullable()
    .optional(),
});
export type TodayTimecard = z.infer<typeof TodayTimecardSchema>;

/**
 * A past working day that still needs the employee's action: absent (loss of
 * pay unless covered by leave) or partial (missing punch / short hours).
 */
export const AttendanceActionItemSchema = z.object({
  workDate: z.string().date(),
  kind: z.enum(['absent', 'partial']),
  /** What the app suggests: leave for absent days, regularisation for partial ones. */
  suggestedAction: z.enum(['leave', 'regularisation']),
  workedMinutes: z.number().int().nonnegative(),
  requiredMinutes: z.number().int().positive(),
  /** First and last evidence seen that day (null when none). */
  detectedStart: z.string().datetime().nullable(),
  detectedEnd: z.string().datetime().nullable(),
  /** Shift window, used to prefill corrected times. */
  expectedStart: z.string().datetime(),
  expectedEnd: z.string().datetime(),
  /** Prefilled regularisation details. */
  source: z.enum(['biometric', 'access_card', 'website']),
  missingEvent: z.enum(['opening', 'closing', 'both']),
  /** Plain-language reasons, e.g. "No biometric exit". */
  issues: z.array(z.string()),
});
export type AttendanceActionItem = z.infer<typeof AttendanceActionItemSchema>;

export const AttendanceActionItemsDtoSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  items: z.array(AttendanceActionItemSchema),
});
export type AttendanceActionItemsDto = z.infer<typeof AttendanceActionItemsDtoSchema>;
