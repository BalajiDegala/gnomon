import { z } from 'zod';

import { CalendarMonthSchema } from './calendar.js';
import { LeaveDayPartSchema, LeaveStatusSchema, LeaveTypeSchema } from './leave.js';
import { RegularisationSourceSchema, RegularisationStatusSchema } from './regularisation.js';

export const WorkforceReportQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    path: ['dateTo'],
    message: 'The end date must be on or after the start date',
  });
export type WorkforceReportQuery = z.infer<typeof WorkforceReportQuerySchema>;

export const AttendanceReportRowSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  workDate: z.string().date(),
  status: z.enum([
    'present',
    'partial',
    'absent',
    'leave',
    'holiday',
    'weekend',
    'pending_regularisation',
  ]),
  primarySource: z.enum(['biometric', 'access_card', 'website', 'none']),
  payableMinutes: z.number().int().nonnegative(),
  requiredMinutes: z.number().int().positive(),
  differenceMinutes: z.number().int(),
  requiresReview: z.boolean(),
  anomalies: z.array(z.string()),
  finalSource: z.enum(['calculated', 'regularised', 'approved_leave', 'holiday', 'hr_override']),
});
export type AttendanceReportRow = z.infer<typeof AttendanceReportRowSchema>;

export const LeaveReportRowSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  leaveType: LeaveTypeSchema,
  startDate: z.string().date(),
  endDate: z.string().date(),
  dayPart: LeaveDayPartSchema,
  requestedDays: z.number().positive(),
  status: LeaveStatusSchema,
  submittedAt: z.string().datetime(),
});
export type LeaveReportRow = z.infer<typeof LeaveReportRowSchema>;

export const RegularisationReportRowSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  workDate: z.string().date(),
  source: RegularisationSourceSchema,
  missingEvent: z.enum(['opening', 'closing', 'both']),
  requestedMinutes: z.number().int().positive(),
  status: RegularisationStatusSchema,
  submittedAt: z.string().datetime(),
});
export type RegularisationReportRow = z.infer<typeof RegularisationReportRowSchema>;

export const TimesheetReportRowSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  workDate: z.string().date(),
  showCode: z.string(),
  showName: z.string(),
  durationMinutes: z.number().int().positive(),
  percentage: z.number().int().min(10).max(100).multipleOf(10),
  comment: z.string(),
});
export type TimesheetReportRow = z.infer<typeof TimesheetReportRowSchema>;

export const WorkforceReportSummarySchema = z.object({
  scopedEmployees: z.number().int().nonnegative(),
  attendanceRecords: z.number().int().nonnegative(),
  presentDays: z.number().int().nonnegative(),
  exceptionDays: z.number().int().nonnegative(),
  payableMinutes: z.number().int().nonnegative(),
  approvedLeaveDays: z.number().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  timesheetMinutes: z.number().int().nonnegative(),
});
export type WorkforceReportSummary = z.infer<typeof WorkforceReportSummarySchema>;

export const WorkforceReportDtoSchema = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  generatedAt: z.string().datetime(),
  summary: WorkforceReportSummarySchema,
  attendance: z.array(AttendanceReportRowSchema),
  leave: z.array(LeaveReportRowSchema),
  regularisations: z.array(RegularisationReportRowSchema),
  timesheets: z.array(TimesheetReportRowSchema),
});
export type WorkforceReportDto = z.infer<typeof WorkforceReportDtoSchema>;

export const AttendanceDetailsQuerySchema = z.object({
  month: CalendarMonthSchema.optional(),
});
export type AttendanceDetailsQuery = z.infer<typeof AttendanceDetailsQuerySchema>;

const SourceEndpointSchema = z.object({
  firstAt: z.string().datetime().nullable(),
  lastAt: z.string().datetime().nullable(),
  workedMinutes: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
});

export const AttendanceDetailsRowSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  departmentName: z.string().nullable(),
  workDate: z.string().date(),
  status: z.enum([
    'present',
    'partial',
    'absent',
    'leave',
    'holiday',
    'weekend',
    'pending_regularisation',
  ]),
  requiresReview: z.boolean(),
  biometric: SourceEndpointSchema.extend({
    status: z.enum(['complete', 'missing_in', 'missing_out', 'invalid', 'none']),
  }),
  accessCard: SourceEndpointSchema.extend({
    status: z.enum(['complete', 'missing_entry', 'missing_exit', 'invalid', 'none']),
  }),
  website: z.object({
    status: z.enum(['running', 'complete', 'incomplete', 'none']),
    firstAt: z.string().datetime().nullable(),
    lastAt: z.string().datetime().nullable(),
    workedMinutes: z.number().int().nonnegative(),
    sessionCount: z.number().int().nonnegative(),
  }),
  timesheets: z.object({
    totalMinutes: z.number().int().nonnegative(),
    entryCount: z.number().int().nonnegative(),
    averageProgress: z.number().int().min(0).max(100),
  }),
  payableMinutes: z.number().int().nonnegative(),
  anomalies: z.array(z.string()),
});
export type AttendanceDetailsRow = z.infer<typeof AttendanceDetailsRowSchema>;

export const AttendanceDetailsMonthAvailabilitySchema = z.object({
  month: CalendarMonthSchema,
  attendanceDays: z.number().int().nonnegative(),
  employeesWithRecords: z.number().int().nonnegative(),
  biometricDays: z.number().int().nonnegative(),
  biometricEvents: z.number().int().nonnegative(),
  accessCardDays: z.number().int().nonnegative(),
  accessCardEvents: z.number().int().nonnegative(),
  websiteDays: z.number().int().nonnegative(),
  websiteSessions: z.number().int().nonnegative(),
  timesheetDays: z.number().int().nonnegative(),
  timesheetEntries: z.number().int().nonnegative(),
});
export type AttendanceDetailsMonthAvailability = z.infer<
  typeof AttendanceDetailsMonthAvailabilitySchema
>;

export const AttendanceDetailsDtoSchema = z.object({
  month: CalendarMonthSchema,
  latestRecordedMonth: CalendarMonthSchema.nullable(),
  availableMonths: z.array(AttendanceDetailsMonthAvailabilitySchema),
  generatedAt: z.string().datetime(),
  summary: z.object({
    scopedEmployees: z.number().int().nonnegative(),
    employeesWithRecords: z.number().int().nonnegative(),
    attendanceDays: z.number().int().nonnegative(),
    completeBiometricDays: z.number().int().nonnegative(),
    completeAccessCardDays: z.number().int().nonnegative(),
    websiteSessionDays: z.number().int().nonnegative(),
    timesheetDays: z.number().int().nonnegative(),
  }),
  rows: z.array(AttendanceDetailsRowSchema),
});
export type AttendanceDetailsDto = z.infer<typeof AttendanceDetailsDtoSchema>;
