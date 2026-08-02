import { z } from 'zod';

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
