import { z } from 'zod';

const ObjectIdStringSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid identifier is required');

export const ShowStatusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);
export type ShowStatus = z.infer<typeof ShowStatusSchema>;

export const ShowAdminDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: ShowStatusSchema,
});
export type ShowAdminDto = z.infer<typeof ShowAdminDtoSchema>;

export const TimesheetOptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});
export type TimesheetOption = z.infer<typeof TimesheetOptionSchema>;

export const TimeEntryDtoSchema = z.object({
  id: z.string(),
  workDate: z.string().date(),
  showId: z.string(),
  showCode: z.string(),
  showName: z.string(),
  workSessionId: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  durationMinutes: z.number().int().positive(),
  comment: z.string(),
  percentage: z.number().int().min(10).max(100).multipleOf(10),
});
export type TimeEntryDto = z.infer<typeof TimeEntryDtoSchema>;

export const TimesheetDayDtoSchema = z.object({
  workDate: z.string().date(),
  entries: z.array(TimeEntryDtoSchema),
  totalMinutes: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  averageProgress: z.number().int().min(0).max(100),
});
export type TimesheetDayDto = z.infer<typeof TimesheetDayDtoSchema>;

export const CreateShowRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
});
export type CreateShowRequest = z.infer<typeof CreateShowRequestSchema>;

export const UpdateShowRequestSchema = CreateShowRequestSchema.extend({
  status: ShowStatusSchema,
});
export type UpdateShowRequest = z.infer<typeof UpdateShowRequestSchema>;

export const CreateTimeEntryRequestSchema = z.object({
  workDate: z.string().date(),
  showId: ObjectIdStringSchema,
  hours: z
    .number()
    .positive('Hours must be more than 0')
    .max(24, 'Hours cannot exceed 24')
    .refine((value) => Number.isInteger(value * 4), 'Use quarter-hour steps (e.g. 1.25, 2.5)'),
  comment: z.string().trim().min(1).max(500),
  percentage: z.number().int().min(10).max(100).multipleOf(10),
});
export type CreateTimeEntryRequest = z.infer<typeof CreateTimeEntryRequestSchema>;
export const UpdateTimeEntryRequestSchema = CreateTimeEntryRequestSchema;
export type UpdateTimeEntryRequest = z.infer<typeof UpdateTimeEntryRequestSchema>;

export const TimesheetDateQuerySchema = z.object({
  workDate: z.string().date().optional(),
});

/** Own entries across a date range (at most 93 days), for the week/month views. */
export const TimesheetRangeQuerySchema = z
  .object({ from: z.string().date(), to: z.string().date() })
  .refine((value) => value.from <= value.to, { message: 'from must be on or before to' })
  .refine(
    (value) => (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86_400_000 <= 92,
    { message: 'The range cannot exceed 93 days' },
  );

export const TimecardDataImportIssueSchema = z.object({
  rowNumber: z.number().int().positive(),
  login: z.string(),
  reason: z.string(),
});
export type TimecardDataImportIssue = z.infer<typeof TimecardDataImportIssueSchema>;

/** Result of importing timecard records exported from another timecard application. */
export const TimecardDataImportResponseSchema = z.object({
  fileName: z.string(),
  totalRecords: z.number().int().nonnegative(),
  importedRecords: z.number().int().nonnegative(),
  sessionsCreated: z.number().int().nonnegative(),
  sessionsUpdated: z.number().int().nonnegative(),
  /** Records still "Working" in the source: imported as unfinished days needing regularisation. */
  openSessions: z.number().int().nonnegative(),
  timesheetEntries: z.number().int().nonnegative(),
  showsCreated: z.array(z.string()),
  unmatchedLogins: z.array(z.string()),
  errors: z.array(TimecardDataImportIssueSchema),
});
export type TimecardDataImportResponse = z.infer<typeof TimecardDataImportResponseSchema>;
