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
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
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

export const CreateTimeEntryRequestSchema = z
  .object({
    showId: ObjectIdStringSchema,
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    comment: z.string().trim().min(1).max(500),
    percentage: z.number().int().min(10).max(100).multipleOf(10),
  })
  .refine((value) => new Date(value.endedAt) > new Date(value.startedAt), {
    path: ['endedAt'],
    message: 'End time must be after start time',
  });
export type CreateTimeEntryRequest = z.infer<typeof CreateTimeEntryRequestSchema>;
export const UpdateTimeEntryRequestSchema = CreateTimeEntryRequestSchema;
export type UpdateTimeEntryRequest = z.infer<typeof UpdateTimeEntryRequestSchema>;

export const TimesheetDateQuerySchema = z.object({
  workDate: z.string().date().optional(),
});
