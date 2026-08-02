import type { AuthUser, WorkforceReportDto, WorkforceReportQuery } from '@gnomon/shared';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { buildEmployeeScopeFilter } from '../employees/employee-scope.service.js';
import { LeaveRequest } from '../leaves/leave.model.js';
import { DailyTimecard } from '../reconciliation/daily-timecard.model.js';
import { RegularisationRequest } from '../regularisations/regularisation.model.js';
import { Show } from '../shows/show.model.js';
import { TimeEntry } from '../timesheets/time-entry.model.js';

const REPORT_PERMISSIONS = ['attendance:all:read', 'attendance:team:read', 'audit:read'] as const;

export function assertReportDateRange(input: WorkforceReportQuery): void {
  const from = Date.parse(`${input.dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${input.dateTo}T00:00:00.000Z`);
  const inclusiveDays = Math.floor((to - from) / 86_400_000) + 1;
  if (inclusiveDays > 92) {
    throw new HttpError(400, 'Reports are limited to 92 days at a time', 'REPORT_RANGE_TOO_LARGE');
  }
}

export async function buildWorkforceReport(
  user: AuthUser,
  input: WorkforceReportQuery,
): Promise<WorkforceReportDto> {
  assertReportDateRange(input);
  const scope = await buildEmployeeScopeFilter(user, [...REPORT_PERMISSIONS]);
  const employees = await Employee.find(scope)
    .select({ employeeCode: 1, firstName: 1, lastName: 1, status: 1 })
    .lean()
    .exec();
  const employeeIds = employees.map((employee) => employee._id);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const dateFilter = { $gte: input.dateFrom, $lte: input.dateTo };

  const [timecards, leaveRequests, regularisations, timeEntries] = await Promise.all([
    DailyTimecard.find({ employeeId: { $in: employeeIds }, workDate: dateFilter })
      .sort({ workDate: -1 })
      .lean()
      .exec(),
    LeaveRequest.find({
      employeeId: { $in: employeeIds },
      startDate: { $lte: input.dateTo },
      endDate: { $gte: input.dateFrom },
    })
      .sort({ startDate: -1, submittedAt: -1 })
      .lean()
      .exec(),
    RegularisationRequest.find({ employeeId: { $in: employeeIds }, workDate: dateFilter })
      .sort({ workDate: -1, submittedAt: -1 })
      .lean()
      .exec(),
    TimeEntry.find({ employeeId: { $in: employeeIds }, workDate: dateFilter })
      .sort({ workDate: -1, startedAt: -1 })
      .lean()
      .exec(),
  ]);

  const shows = await Show.find({ _id: { $in: timeEntries.map((entry) => entry.showId) } })
    .select({ code: 1, name: 1 })
    .lean()
    .exec();
  const showById = new Map(shows.map((show) => [String(show._id), show]));
  const employeeDetails = (employeeId: unknown) => {
    const employee = employeeById.get(String(employeeId));
    return {
      employeeId: String(employeeId),
      employeeCode: employee?.employeeCode ?? 'UNKNOWN',
      employeeDisplayName: employee
        ? `${employee.firstName} ${employee.lastName}`.trim()
        : 'Unknown employee',
    };
  };

  const attendance: WorkforceReportDto['attendance'] = timecards.map((timecard) => {
    const calculated = timecard.calculated;
    return {
      id: String(timecard._id),
      ...employeeDetails(timecard.employeeId),
      workDate: timecard.workDate,
      status: calculated?.status ?? 'absent',
      primarySource: calculated?.primarySource ?? 'none',
      payableMinutes: calculated?.payableMinutes ?? 0,
      requiredMinutes: calculated?.requiredMinutes ?? 540,
      differenceMinutes: calculated?.differenceMinutes ?? -540,
      requiresReview: calculated?.requiresReview ?? true,
      anomalies: calculated?.anomalies ?? [],
      finalSource: timecard.finalisation?.finalSource ?? 'calculated',
    };
  });
  const leave: WorkforceReportDto['leave'] = leaveRequests.map((request) => ({
    id: String(request._id),
    ...employeeDetails(request.employeeId),
    leaveType: request.leaveType,
    startDate: request.startDate,
    endDate: request.endDate,
    dayPart: request.dayPart,
    requestedDays: request.requestedDays,
    status: request.status,
    submittedAt: request.submittedAt.toISOString(),
  }));
  const regularisationRows: WorkforceReportDto['regularisations'] = regularisations.map(
    (request) => ({
      id: String(request._id),
      ...employeeDetails(request.employeeId),
      workDate: request.workDate,
      source: request.source,
      missingEvent: request.missingEvent,
      requestedMinutes: request.requestedMinutes,
      status: request.status,
      submittedAt: request.submittedAt.toISOString(),
    }),
  );
  const timesheets: WorkforceReportDto['timesheets'] = timeEntries.map((entry) => {
    const show = showById.get(String(entry.showId));
    return {
      id: String(entry._id),
      ...employeeDetails(entry.employeeId),
      workDate: entry.workDate,
      showCode: show?.code ?? 'UNKNOWN',
      showName: show?.name ?? 'Unknown show',
      durationMinutes: entry.durationMinutes,
      percentage: entry.percentage ?? 100,
      comment: entry.comment,
    };
  });

  const pendingApprovals =
    leave.filter((row) => row.status === 'pending_manager').length +
    regularisationRows.filter(
      (row) => row.status === 'pending_manager' || row.status === 'pending_hr',
    ).length;

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: new Date().toISOString(),
    summary: {
      scopedEmployees: employees.filter((employee) => employee.status === 'active').length,
      attendanceRecords: attendance.length,
      presentDays: attendance.filter((row) => row.status === 'present').length,
      exceptionDays: attendance.filter((row) => row.requiresReview).length,
      payableMinutes: attendance.reduce((total, row) => total + row.payableMinutes, 0),
      approvedLeaveDays: leaveRequests
        .filter((request) => request.status === 'approved')
        .reduce(
          (total, request) =>
            total +
            request.workingDates.filter((date) => date >= input.dateFrom && date <= input.dateTo)
              .length *
              (request.dayPart === 'full_day' ? 1 : 0.5),
          0,
        ),
      pendingApprovals,
      timesheetMinutes: timesheets.reduce((total, row) => total + row.durationMinutes, 0),
    },
    attendance,
    leave,
    regularisations: regularisationRows,
    timesheets,
  };
}
