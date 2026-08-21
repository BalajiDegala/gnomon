import {
  getWorkDate,
  type AttendanceDetailsDto,
  type AttendanceDetailsQuery,
  type AuthUser,
  type WorkforceReportDto,
  type WorkforceReportQuery,
} from '@gnomon/shared';

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
  const employees = await Employee.find({
    $and: [scope, { profileSource: { $in: ['users_csv', 'manual'] } }],
  })
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
    leave.filter((row) => row.status === 'pending_manager' || row.status === 'pending_hr').length +
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

function isoInstant(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function buildAttendanceDetails(
  user: AuthUser,
  input: AttendanceDetailsQuery,
): Promise<AttendanceDetailsDto> {
  const scope = await buildEmployeeScopeFilter(user, [...REPORT_PERMISSIONS]);
  const employees = await Employee.find({
    $and: [scope, { profileSource: { $in: ['users_csv', 'manual'] } }],
  })
    .select({
      employeeCode: 1,
      firstName: 1,
      lastName: 1,
      status: 1,
      hrProfile: 1,
      attendanceIdentity: 1,
    })
    .sort({ firstName: 1, lastName: 1, employeeCode: 1 })
    .lean()
    .exec();
  const employeeIds = employees.map((employee) => employee._id);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const latestTimecard = await DailyTimecard.findOne({ employeeId: { $in: employeeIds } })
    .select({ workDate: 1 })
    .sort({ workDate: -1 })
    .lean()
    .exec();
  const recordedMonths = await DailyTimecard.aggregate<{
    month: string;
    attendanceDays: number;
    employeeCount: number;
    biometricDays: number;
    biometricEvents: number;
    accessCardDays: number;
    accessCardEvents: number;
    websiteDays: number;
    websiteSessions: number;
    timesheetDays: number;
    timesheetEntries: number;
  }>([
    { $match: { employeeId: { $in: employeeIds } } },
    {
      $group: {
        _id: { $substrBytes: ['$workDate', 0, 7] },
        attendanceDays: { $sum: 1 },
        employees: { $addToSet: '$employeeId' },
        biometricDays: {
          $sum: { $cond: [{ $gt: ['$sourceSummary.biometric.eventCount', 0] }, 1, 0] },
        },
        biometricEvents: { $sum: { $ifNull: ['$sourceSummary.biometric.eventCount', 0] } },
        accessCardDays: {
          $sum: { $cond: [{ $gt: ['$sourceSummary.accessCard.eventCount', 0] }, 1, 0] },
        },
        accessCardEvents: { $sum: { $ifNull: ['$sourceSummary.accessCard.eventCount', 0] } },
        websiteDays: {
          $sum: { $cond: [{ $gt: ['$sourceSummary.website.sessionCount', 0] }, 1, 0] },
        },
        websiteSessions: { $sum: { $ifNull: ['$sourceSummary.website.sessionCount', 0] } },
        timesheetDays: {
          $sum: { $cond: [{ $gt: ['$sourceSummary.showEntries.entryCount', 0] }, 1, 0] },
        },
        timesheetEntries: { $sum: { $ifNull: ['$sourceSummary.showEntries.entryCount', 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        month: '$_id',
        attendanceDays: 1,
        employeeCount: { $size: '$employees' },
        biometricDays: 1,
        biometricEvents: 1,
        accessCardDays: 1,
        accessCardEvents: 1,
        websiteDays: 1,
        websiteSessions: 1,
        timesheetDays: 1,
        timesheetEntries: 1,
      },
    },
    { $sort: { month: -1 } },
  ]).exec();
  const widestCoverageMonth = [...recordedMonths].sort(
    (left, right) =>
      right.employeeCount - left.employeeCount ||
      right.attendanceDays - left.attendanceDays ||
      right.month.localeCompare(left.month),
  )[0];
  const latestRecordedMonth = latestTimecard?.workDate.slice(0, 7) ?? null;
  const month =
    input.month ??
    widestCoverageMonth?.month ??
    latestRecordedMonth ??
    getWorkDate(new Date()).slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const timecards = await DailyTimecard.find({
    employeeId: { $in: employeeIds },
    workDate: { $gte: monthStart, $lte: monthEnd },
  })
    .sort({ workDate: -1, employeeId: 1 })
    .lean()
    .exec();

  const rows: AttendanceDetailsDto['rows'] = timecards.map((timecard) => {
    const employee = employeeById.get(String(timecard.employeeId));
    const biometric = timecard.sourceSummary?.biometric;
    const accessCard = timecard.sourceSummary?.accessCard;
    const website = timecard.sourceSummary?.website;
    const timesheets = timecard.sourceSummary?.showEntries;
    const calculated = timecard.calculated;
    return {
      id: String(timecard._id),
      employeeId: String(timecard.employeeId),
      employeeCode: employee?.employeeCode ?? 'UNKNOWN',
      employeeDisplayName: employee
        ? (employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`.trim())
        : 'Unknown employee',
      departmentName:
        employee?.hrProfile?.departmentName ?? employee?.attendanceIdentity?.departmentName ?? null,
      workDate: timecard.workDate,
      status: calculated?.status ?? 'absent',
      requiresReview: calculated?.requiresReview ?? true,
      biometric: {
        status: biometric?.status ?? 'none',
        firstAt: isoInstant(biometric?.firstAt),
        lastAt: isoInstant(biometric?.lastAt),
        workedMinutes: biometric?.workedMinutes ?? 0,
        eventCount: biometric?.eventCount ?? 0,
      },
      accessCard: {
        status: accessCard?.status ?? 'none',
        firstAt: isoInstant(accessCard?.firstAt),
        lastAt: isoInstant(accessCard?.lastAt),
        workedMinutes: accessCard?.workedMinutes ?? 0,
        eventCount: accessCard?.eventCount ?? 0,
      },
      website: {
        status: website?.status ?? 'none',
        firstAt: isoInstant(website?.firstAt),
        lastAt: isoInstant(website?.lastAt),
        workedMinutes: website?.workedMinutes ?? 0,
        sessionCount: website?.sessionCount ?? 0,
      },
      timesheets: {
        totalMinutes: timesheets?.totalMinutes ?? 0,
        entryCount: timesheets?.entryCount ?? 0,
        averageProgress: timesheets?.averageProgress ?? 0,
      },
      payableMinutes: calculated?.payableMinutes ?? 0,
      anomalies: calculated?.anomalies ?? [],
    };
  });
  const recordedEmployees = new Set(rows.map((row) => row.employeeId));
  return {
    month,
    latestRecordedMonth,
    availableMonths: recordedMonths.map((recordedMonth) => ({
      month: recordedMonth.month,
      attendanceDays: recordedMonth.attendanceDays,
      employeesWithRecords: recordedMonth.employeeCount,
      biometricDays: recordedMonth.biometricDays,
      biometricEvents: recordedMonth.biometricEvents,
      accessCardDays: recordedMonth.accessCardDays,
      accessCardEvents: recordedMonth.accessCardEvents,
      websiteDays: recordedMonth.websiteDays,
      websiteSessions: recordedMonth.websiteSessions,
      timesheetDays: recordedMonth.timesheetDays,
      timesheetEntries: recordedMonth.timesheetEntries,
    })),
    generatedAt: new Date().toISOString(),
    summary: {
      scopedEmployees: employees.filter((employee) => employee.status === 'active').length,
      employeesWithRecords: recordedEmployees.size,
      attendanceDays: rows.length,
      completeBiometricDays: rows.filter((row) => row.biometric.status === 'complete').length,
      completeAccessCardDays: rows.filter((row) => row.accessCard.status === 'complete').length,
      websiteSessionDays: rows.filter((row) => row.website.sessionCount > 0).length,
      timesheetDays: rows.filter((row) => row.timesheets.entryCount > 0).length,
    },
    rows,
  };
}
