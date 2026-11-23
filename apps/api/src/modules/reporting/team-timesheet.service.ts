import type { AuthUser, TeamTimesheetDto, TeamTimesheetQuery } from '@gnomon/shared';
import { Types, type QueryFilter } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { buildEmployeeScopeFilter } from '../employees/employee-scope.service.js';
import { Show } from '../shows/show.model.js';
import { TimeEntry, type TimeEntryDocument } from '../timesheets/time-entry.model.js';
import { attendanceReportDepartment } from './attendance-report-identity.js';

const PEOPLE_PERMISSIONS = ['attendance:all:read', 'attendance:team:read', 'audit:read'] as const;
const MAX_RANGE_DAYS = 92;

export function assertTimesheetRange(input: TeamTimesheetQuery): void {
  const from = Date.parse(`${input.dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${input.dateTo}T00:00:00.000Z`);
  if (Math.floor((to - from) / 86_400_000) + 1 > MAX_RANGE_DAYS) {
    throw new HttpError(
      400,
      `Timesheets are limited to ${MAX_RANGE_DAYS} days at a time`,
      'TIMESHEET_RANGE_TOO_LARGE',
    );
  }
}

/**
 * Shows whose timesheets the viewer manages. `all` means company-wide show
 * management; otherwise the explicit show ids from show-scoped grants.
 */
function managedShowScope(user: AuthUser): 'all' | Types.ObjectId[] {
  const grants = user.grants.filter((grant) => grant.permissions.includes('show:manage'));
  if (grants.some((grant) => grant.scope.type === 'company')) return 'all';
  return grants
    .filter((grant) => grant.scope.type === 'show')
    .flatMap((grant) => grant.scope.ids)
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

function hasPeoplePermission(user: AuthUser): boolean {
  return user.grants.some((grant) =>
    grant.permissions.some((permission) =>
      (PEOPLE_PERMISSIONS as readonly string[]).includes(permission),
    ),
  );
}

/**
 * Team timesheet review. A viewer sees entries by the people in their
 * attendance scope (reporting managers: their team; HR/admin: everyone) plus
 * every entry booked to a show they manage.
 */
export async function buildTeamTimesheets(
  user: AuthUser,
  input: TeamTimesheetQuery,
): Promise<TeamTimesheetDto> {
  assertTimesheetRange(input);
  const showScope = managedShowScope(user);
  const canSeePeople = hasPeoplePermission(user);
  if (!canSeePeople && showScope !== 'all' && showScope.length === 0) {
    throw new HttpError(403, 'You do not have permission to review timesheets', 'FORBIDDEN');
  }

  const peopleScope = canSeePeople
    ? await buildEmployeeScopeFilter(user, [...PEOPLE_PERMISSIONS])
    : null;
  const scopedEmployees = peopleScope
    ? await Employee.find({ $and: [peopleScope, { profileSource: { $ne: 'system' } }] })
        .select({ _id: 1, hrProfile: 1, biometricProfile: 1 })
        .lean()
        .exec()
    : [];

  const entryScopes: QueryFilter<TimeEntryDocument>[] = [];
  if (showScope === 'all') entryScopes.push({});
  else if (showScope.length > 0) entryScopes.push({ showId: { $in: showScope } });
  if (peopleScope) {
    entryScopes.push({ employeeId: { $in: scopedEmployees.map((employee) => employee._id) } });
  }

  const entries = await TimeEntry.find({
    workDate: { $gte: input.dateFrom, $lte: input.dateTo },
    ...(entryScopes.length === 1 ? entryScopes[0] : { $or: entryScopes }),
  })
    .sort({ workDate: -1, createdAt: 1 })
    .lean()
    .exec();

  const [employees, shows] = await Promise.all([
    Employee.find({ _id: { $in: [...new Set(entries.map((entry) => String(entry.employeeId)))] } })
      .select({
        employeeCode: 1,
        firstName: 1,
        lastName: 1,
        hrProfile: 1,
        biometricProfile: 1,
      })
      .lean()
      .exec(),
    Show.find(
      showScope === 'all' || canSeePeople
        ? { $or: [{ status: { $ne: 'archived' } }, { _id: { $in: entries.map((e) => e.showId) } }] }
        : { _id: { $in: [...showScope, ...entries.map((entry) => entry.showId)] } },
    )
      .select({ code: 1, name: 1 })
      .sort({ code: 1 })
      .lean()
      .exec(),
  ]);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const showById = new Map(shows.map((show) => [String(show._id), show]));

  const rows: TeamTimesheetDto['rows'] = entries.map((entry) => {
    const employee = employeeById.get(String(entry.employeeId));
    const show = showById.get(String(entry.showId));
    return {
      id: String(entry._id),
      employeeId: String(entry.employeeId),
      employeeCode: employee?.employeeCode ?? 'UNKNOWN',
      employeeDisplayName: employee
        ? (employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`.trim())
        : 'Unknown employee',
      departmentName: employee ? attendanceReportDepartment(employee) : null,
      workDate: entry.workDate,
      showId: String(entry.showId),
      showCode: show?.code ?? 'UNKNOWN',
      showName: show?.name ?? 'Unknown show',
      startedAt: entry.startedAt ? entry.startedAt.toISOString() : null,
      endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
      durationMinutes: entry.durationMinutes,
      percentage: entry.percentage ?? 100,
      comment: entry.comment,
    };
  });

  const departments = new Set<string>();
  for (const employee of scopedEmployees) {
    const department = attendanceReportDepartment(employee);
    if (department) departments.add(department);
  }
  for (const row of rows) if (row.departmentName) departments.add(row.departmentName);

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: new Date().toISOString(),
    departments: [...departments].sort((left, right) => left.localeCompare(right)),
    shows: shows.map((show) => ({ id: String(show._id), code: show.code, name: show.name })),
    rows,
  };
}
