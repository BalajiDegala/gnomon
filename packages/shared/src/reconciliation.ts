import { z } from 'zod';

export const BiometricDayStatusSchema = z.enum([
  'complete',
  'missing_in',
  'missing_out',
  'invalid',
  'none',
]);
export type BiometricDayStatus = z.infer<typeof BiometricDayStatusSchema>;

export const AccessCardDayStatusSchema = z.enum([
  'complete',
  'missing_entry',
  'missing_exit',
  'invalid',
  'none',
]);
export type AccessCardDayStatus = z.infer<typeof AccessCardDayStatusSchema>;

export const WebsiteDayStatusSchema = z.enum(['running', 'complete', 'incomplete', 'none']);
export type WebsiteDayStatus = z.infer<typeof WebsiteDayStatusSchema>;

export const DailyAttendanceStatusSchema = z.enum([
  'present',
  'partial',
  'absent',
  'leave',
  'holiday',
  'weekend',
  'pending_regularisation',
]);
export type DailyAttendanceStatus = z.infer<typeof DailyAttendanceStatusSchema>;

export const ReconciliationSourceSchema = z.enum(['biometric', 'access_card', 'website', 'none']);
export type ReconciliationSource = z.infer<typeof ReconciliationSourceSchema>;

export const ReconciliationAnomalySchema = z.enum([
  'missing_biometric_in',
  'missing_biometric_out',
  'missing_access_entry',
  'missing_access_exit',
  'missing_web_start',
  'missing_web_stop',
  'source_time_mismatch',
  'insufficient_hours',
  'show_time_outside_web_session',
  'show_time_exceeds_presence',
  'invalid_event_order',
]);
export type ReconciliationAnomaly = z.infer<typeof ReconciliationAnomalySchema>;

const SourceIntervalSchema = z.object({
  firstAt: z.string().datetime().nullable(),
  lastAt: z.string().datetime().nullable(),
  workedMinutes: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
});

export const DailyReconciliationDtoSchema = z.object({
  id: z.string(),
  workDate: z.string().date(),
  timezone: z.string(),
  window: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    expectedStart: z.string().datetime(),
    expectedEnd: z.string().datetime(),
    requiredMinutes: z.number().int().positive(),
  }),
  sourceSummary: z.object({
    biometric: SourceIntervalSchema.extend({ status: BiometricDayStatusSchema }),
    accessCard: SourceIntervalSchema.extend({ status: AccessCardDayStatusSchema }),
    website: z.object({
      status: WebsiteDayStatusSchema,
      firstAt: z.string().datetime().nullable(),
      lastAt: z.string().datetime().nullable(),
      workedMinutes: z.number().int().nonnegative(),
      sessionCount: z.number().int().nonnegative(),
    }),
    showEntries: z.object({
      totalMinutes: z.number().int().nonnegative(),
      entryCount: z.number().int().nonnegative(),
      averageProgress: z.number().int().min(0).max(100),
    }),
  }),
  calculated: z.object({
    primarySource: ReconciliationSourceSchema,
    attendanceStart: z.string().datetime().nullable(),
    attendanceEnd: z.string().datetime().nullable(),
    grossMinutes: z.number().int().nonnegative(),
    breakMinutes: z.number().int().nonnegative(),
    payableMinutes: z.number().int().nonnegative(),
    requiredMinutes: z.number().int().positive(),
    differenceMinutes: z.number().int(),
    status: DailyAttendanceStatusSchema,
    anomalies: z.array(ReconciliationAnomalySchema),
    workdayClosed: z.boolean(),
    provisional: z.boolean(),
    requiresReview: z.boolean(),
  }),
  generatedAt: z.string().datetime(),
});
export type DailyReconciliationDto = z.infer<typeof DailyReconciliationDtoSchema>;

export const DailyReconciliationQuerySchema = z.object({
  workDate: z.string().date().optional(),
});
