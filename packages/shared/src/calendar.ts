import { z } from 'zod';

import { LeaveDayPartSchema, LeaveStatusSchema, LeaveTypeSchema } from './leave.js';

export const CalendarMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => {
    const monthNumber = Number(month.slice(5, 7));
    return monthNumber >= 1 && monthNumber <= 12;
  }, 'A valid calendar month is required');

export const PersonalCalendarDayDtoSchema = z.object({
  date: z.string().date(),
  weekday: z.number().int().min(1).max(7),
  isWorkingDay: z.boolean(),
  attendance: z
    .object({
      status: z.enum([
        'present',
        'partial',
        'absent',
        'leave',
        'holiday',
        'weekend',
        'pending_regularisation',
      ]),
      grossMinutes: z.number().int().nonnegative(),
      regularisationStatus: z.enum(['not_required', 'draft', 'pending', 'approved', 'rejected']),
      isFinal: z.boolean(),
    })
    .nullable(),
  leave: z
    .object({
      requestId: z.string(),
      leaveType: LeaveTypeSchema,
      dayPart: LeaveDayPartSchema,
      status: LeaveStatusSchema,
      requestedDays: z.number().positive(),
    })
    .nullable(),
});
export type PersonalCalendarDayDto = z.infer<typeof PersonalCalendarDayDtoSchema>;

export const PersonalCalendarDtoSchema = z.object({
  month: CalendarMonthSchema,
  days: z.array(PersonalCalendarDayDtoSchema),
});
export type PersonalCalendarDto = z.infer<typeof PersonalCalendarDtoSchema>;

export const CalendarQuerySchema = z.object({
  month: CalendarMonthSchema.optional(),
});
