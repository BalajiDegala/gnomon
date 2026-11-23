import { z } from 'zod';

const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm time, for example 09:00');

export const WorkModeSchema = z.enum(['office', 'home']);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const workModeLabels: Record<WorkMode, string> = {
  office: 'Work from office',
  home: 'Work from home',
};

export const ShiftDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
  /** Shift length in minutes; overnight shifts (end before start) wrap past midnight. */
  durationMinutes: z.number().int().positive(),
  isDefault: z.boolean(),
  active: z.boolean(),
});
export type ShiftDto = z.infer<typeof ShiftDtoSchema>;

export const ShiftRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
    isDefault: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((value) => value.startTime !== value.endTime, {
    message: 'Start and end time must differ',
    path: ['endTime'],
  })
  .refine((value) => !(value.isDefault && !value.active), {
    message: 'The default shift must be active',
    path: ['active'],
  });
export type ShiftRequest = z.infer<typeof ShiftRequestSchema>;

/**
 * Optional body for POST /timecard/start. The shift is used only by the day's
 * first start; the work mode applies to each new session. Omitted values fall
 * back to the default shift / office.
 */
export const StartTimecardRequestSchema = z.object({
  shiftId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  workMode: WorkModeSchema.optional(),
});
export type StartTimecardRequest = z.infer<typeof StartTimecardRequestSchema>;

/**
 * The shift and work mode(s) for one work date. The shift is fixed at the
 * first start; work mode is chosen per session, so a day can move from office
 * to home (e.g. leaving early and continuing after reaching home).
 */
export const WorkContextSchema = z.object({
  shiftId: z.string().nullable(),
  shiftName: z.string().nullable(),
  shiftStartTime: TimeOfDaySchema.nullable(),
  shiftEndTime: TimeOfDaySchema.nullable(),
  /** Work mode of the first session of the day. */
  workMode: WorkModeSchema.nullable(),
  /** Every work mode used that day, in the order first used (e.g. office then home). */
  workModes: z.array(WorkModeSchema).default([]),
});
export type WorkContext = z.infer<typeof WorkContextSchema>;

export const emptyWorkContext: WorkContext = {
  shiftId: null,
  shiftName: null,
  shiftStartTime: null,
  shiftEndTime: null,
  workMode: null,
  workModes: [],
};

export function shiftDurationMinutes(startTime: string, endTime: string): number {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const difference = toMinutes(endTime) - toMinutes(startTime);
  return difference > 0 ? difference : difference + 24 * 60;
}
