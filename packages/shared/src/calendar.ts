import { z } from 'zod';

import { LeaveDayPartSchema, LeaveStatusSchema, LeaveTypeSchema } from './leave.js';
import { DailyAttendanceStatusSchema } from './reconciliation.js';

export const CalendarMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => {
    const monthNumber = Number(month.slice(5, 7));
    return monthNumber >= 1 && monthNumber <= 12;
  }, 'A valid calendar month is required');

/**
 * Calendar cell state, shared by the personal and team calendars. It mirrors
 * the attendance status shown on Attendance details (present / partial / LOP /
 * leave) so every view agrees.
 */
export const ManagedCalendarAvailabilitySchema = z.enum([
  'present',
  'partial',
  'absent',
  'leave',
  'pending',
  'no_record',
  'upcoming',
  'non_working',
  'not_assigned',
]);
export type ManagedCalendarAvailability = z.infer<typeof ManagedCalendarAvailabilitySchema>;

export interface CalendarAvailabilityEvidence {
  date: string;
  /** ISO weekday, Monday = 1. */
  weekday: number;
  /** Today's work date (Asia/Kolkata). */
  today: string;
  holiday: boolean;
  leave: {
    status: 'pending_manager' | 'pending_hr' | 'approved';
    dayPart: 'full_day' | 'first_half' | 'second_half';
  } | null;
  attendanceStatus:
    | 'present'
    | 'partial'
    | 'absent'
    | 'leave'
    | 'holiday'
    | 'weekend'
    | 'pending_regularisation'
    | null;
}

/**
 * A recorded attendance status always wins, so calendars show exactly what
 * Attendance details shows. Leave only decides days without a record yet.
 */
export function resolveCalendarAvailability(
  evidence: CalendarAvailabilityEvidence,
): ManagedCalendarAvailability {
  if (evidence.weekday > 5 || evidence.holiday) return 'non_working';

  switch (evidence.attendanceStatus) {
    case 'present':
      return 'present';
    case 'partial':
      return 'partial';
    case 'absent':
      return 'absent';
    case 'leave':
      return 'leave';
    case 'pending_regularisation':
      return 'pending';
    case 'holiday':
    case 'weekend':
      return 'non_working';
    case null:
      break;
  }

  if (evidence.leave?.status === 'pending_manager' || evidence.leave?.status === 'pending_hr') {
    return 'pending';
  }
  if (evidence.leave?.status === 'approved') {
    return evidence.leave.dayPart === 'full_day' ? 'leave' : 'partial';
  }
  if (evidence.date > evidence.today) return 'upcoming';
  // Every working day starts as LOP until evidence arrives.
  if (evidence.date === evidence.today) return 'absent';
  return 'no_record';
}

export const PersonalCalendarDayDtoSchema = z.object({
  date: z.string().date(),
  weekday: z.number().int().min(1).max(7),
  isWorkingDay: z.boolean(),
  /** Same code as the team calendar (PR, PT, AB, LV, PN, —, Off). */
  availability: ManagedCalendarAvailabilitySchema,
  holiday: z
    .object({
      id: z.string(),
      name: z.string(),
      scopeType: z.enum(['company', 'location']),
    })
    .nullable(),
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

export const ManagedCalendarAudienceTypeSchema = z.enum(['direct_reports', 'show']);
export type ManagedCalendarAudienceType = z.infer<typeof ManagedCalendarAudienceTypeSchema>;

export const ManagedCalendarQuerySchema = z
  .object({
    month: CalendarMonthSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(50).default(25),
    audienceType: ManagedCalendarAudienceTypeSchema.optional(),
    showId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, 'A valid show identifier is required')
      .optional(),
  })
  .refine((value) => value.audienceType !== 'show' || value.showId, {
    path: ['showId'],
    message: 'A show is required for a show calendar',
  });
export type ManagedCalendarQuery = z.infer<typeof ManagedCalendarQuerySchema>;

export const ManagedCalendarAudienceDtoSchema = z.object({
  type: ManagedCalendarAudienceTypeSchema,
  id: z.string(),
  code: z.string().nullable(),
  label: z.string(),
  memberCount: z.number().int().nonnegative(),
});
export type ManagedCalendarAudienceDto = z.infer<typeof ManagedCalendarAudienceDtoSchema>;

export const ManagedCalendarDayDtoSchema = z.object({
  date: z.string().date(),
  weekday: z.number().int().min(1).max(7),
  availability: ManagedCalendarAvailabilitySchema,
  attendanceStatus: DailyAttendanceStatusSchema.nullable(),
  leave: z
    .object({
      dayPart: LeaveDayPartSchema,
      status: z.enum(['pending_manager', 'pending_hr', 'approved']),
    })
    .nullable(),
  holiday: z
    .object({
      name: z.string(),
      scopeType: z.enum(['company', 'location']),
    })
    .nullable(),
});
export type ManagedCalendarDayDto = z.infer<typeof ManagedCalendarDayDtoSchema>;

export const ManagedCalendarMemberDtoSchema = z.object({
  employeeId: z.string(),
  employeeCode: z.string(),
  displayName: z.string(),
  days: z.array(ManagedCalendarDayDtoSchema),
});
export type ManagedCalendarMemberDto = z.infer<typeof ManagedCalendarMemberDtoSchema>;

export const ManagedCalendarDtoSchema = z.object({
  month: CalendarMonthSchema,
  latestRecordedMonth: CalendarMonthSchema.nullable(),
  audiences: z.array(ManagedCalendarAudienceDtoSchema),
  selectedAudience: ManagedCalendarAudienceDtoSchema.nullable(),
  totalMembers: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  members: z.array(ManagedCalendarMemberDtoSchema),
});
export type ManagedCalendarDto = z.infer<typeof ManagedCalendarDtoSchema>;
