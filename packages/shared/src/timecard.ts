import { z } from 'zod';

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
});
export type WorkSessionDto = z.infer<typeof WorkSessionDtoSchema>;

export const TodayTimecardSchema = z.object({
  workDate: z.string().date(),
  state: z.enum(['not_started', 'running', 'completed']),
  activeSession: WorkSessionDtoSchema.nullable(),
  sessions: z.array(WorkSessionDtoSchema),
  totalTrackedSeconds: z.number().int().nonnegative(),
  serverNow: z.string().datetime(),
});
export type TodayTimecard = z.infer<typeof TodayTimecardSchema>;
