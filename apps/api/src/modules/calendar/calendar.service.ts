import {
  getWorkDate,
  type AuthUser,
  type ManagedCalendarAvailability,
  type ManagedCalendarDayDto,
  type ManagedCalendarDto,
  type ManagedCalendarQuery,
  type PersonalCalendarDto,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { LeaveRequest } from '../leaves/leave.model.js';
import { listApplicableHolidays } from '../policies/holiday-applicability.service.js';
import { DailyTimecard } from '../reconciliation/daily-timecard.model.js';
import { Show, ShowAssignment } from '../shows/show.model.js';

function monthWindow(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1));
  return {
    start,
    end,
    endExclusive,
    startDate: `${month}-01`,
    endDate: end.toISOString().slice(0, 10),
  };
}

interface AvailabilityEvidence {
  date: string;
  weekday: number;
  today: string;
  holiday: boolean;
  leave: {
    status: 'pending_manager' | 'approved';
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

export function resolveManagedCalendarAvailability(
  evidence: AvailabilityEvidence,
): ManagedCalendarAvailability {
  if (evidence.weekday > 5 || evidence.holiday) return 'non_working';
  if (evidence.leave?.status === 'pending_manager') return 'pending';
  if (evidence.leave?.status === 'approved') {
    return evidence.leave.dayPart === 'full_day' ? 'unavailable' : 'partial';
  }

  switch (evidence.attendanceStatus) {
    case 'present':
      return 'available';
    case 'partial':
      return 'partial';
    case 'absent':
    case 'leave':
      return 'unavailable';
    case 'pending_regularisation':
      return 'pending';
    case 'holiday':
    case 'weekend':
      return 'non_working';
    default:
      return evidence.date >= evidence.today ? 'available' : 'no_record';
  }
}

export async function getPersonalCalendar(
  employeeId: string,
  month = getWorkDate(new Date()).slice(0, 7),
): Promise<PersonalCalendarDto> {
  const window = monthWindow(month);
  const [dailyTimecards, leaveRequests, holidays] = await Promise.all([
    DailyTimecard.find({
      employeeId,
      workDate: { $gte: window.startDate, $lte: window.endDate },
    })
      .lean()
      .exec(),
    LeaveRequest.find({
      employeeId,
      status: { $in: ['pending_manager', 'approved'] },
      workingDates: { $elemMatch: { $gte: window.startDate, $lte: window.endDate } },
    })
      .lean()
      .exec(),
    listApplicableHolidays(employeeId, window.startDate, window.endDate),
  ]);
  const timecardByDate = new Map(dailyTimecards.map((record) => [record.workDate, record]));
  const leaveByDate = new Map(
    leaveRequests.flatMap((request) =>
      request.workingDates
        .filter((date) => date >= window.startDate && date <= window.endDate)
        .map((date) => [date, request] as const),
    ),
  );
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));

  const days: PersonalCalendarDto['days'] = [];
  for (let date = window.start; date <= window.end; date = new Date(date.getTime() + 86_400_000)) {
    const isoDate = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay() || 7;
    const timecard = timecardByDate.get(isoDate);
    const leave = leaveByDate.get(isoDate);
    const holiday = holidayByDate.get(isoDate);
    days.push({
      date: isoDate,
      weekday,
      isWorkingDay: weekday <= 5 && !holiday,
      holiday: holiday
        ? { id: holiday.id, name: holiday.name, scopeType: holiday.scopeType }
        : null,
      attendance:
        timecard?.calculated && timecard.finalisation
          ? {
              status: timecard.calculated.status,
              grossMinutes: timecard.calculated.grossMinutes,
              regularisationStatus: timecard.regularisationStatus,
              isFinal: timecard.finalisation.isFinal,
            }
          : null,
      leave: leave
        ? {
            requestId: String(leave._id),
            leaveType: leave.leaveType,
            dayPart: leave.dayPart,
            status: leave.status,
            requestedDays: leave.requestedDays,
          }
        : null,
    });
  }
  return { month, days };
}

function attendanceTeamGrants(user: AuthUser) {
  return user.grants.filter((grant) => grant.permissions.includes('attendance:team:read'));
}

function validObjectIds(ids: string[]): Types.ObjectId[] {
  return ids.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id));
}

export async function getManagedCalendar(
  user: AuthUser,
  query: ManagedCalendarQuery,
  now = new Date(),
): Promise<ManagedCalendarDto> {
  const month = query.month ?? getWorkDate(now).slice(0, 7);
  const window = monthWindow(month);
  const grants = attendanceTeamGrants(user);
  const directReportGrants = grants.filter((grant) => grant.scope.type === 'direct_reports');
  const companyShowAccess = grants.some((grant) => grant.scope.type === 'company');
  const scopedShowIds = validObjectIds(
    grants.filter((grant) => grant.scope.type === 'show').flatMap((grant) => grant.scope.ids),
  );

  const directReportFilter: Record<string, unknown> = {
    reportingManagerId: new Types.ObjectId(user.employeeId),
    status: 'active',
  };
  if (
    directReportGrants.length > 0 &&
    !directReportGrants.some((grant) => grant.scope.ids.length === 0)
  ) {
    directReportFilter._id = {
      $in: validObjectIds(directReportGrants.flatMap((grant) => grant.scope.ids)),
    };
  }

  const [directReports, shows] = await Promise.all([
    directReportGrants.length > 0
      ? Employee.find(directReportFilter)
          .select({ employeeCode: 1, firstName: 1, lastName: 1 })
          .sort({ firstName: 1, lastName: 1 })
          .lean()
          .exec()
      : [],
    companyShowAccess || scopedShowIds.length > 0
      ? Show.find(
          companyShowAccess
            ? { status: { $ne: 'archived' } }
            : { _id: { $in: scopedShowIds }, status: { $ne: 'archived' } },
        )
          .select({ code: 1, name: 1 })
          .sort({ name: 1 })
          .lean()
          .exec()
      : [],
  ]);

  const showIds = shows.map((show) => show._id);
  const showAssignments =
    showIds.length > 0
      ? await ShowAssignment.find({
          showId: { $in: showIds },
          activeFrom: { $lt: window.endExclusive },
          $or: [{ activeUntil: null }, { activeUntil: { $gte: window.start } }],
        })
          .select({ showId: 1, employeeId: 1, activeFrom: 1, activeUntil: 1 })
          .lean()
          .exec()
      : [];
  const assignmentIdsByShow = new Map<string, Set<string>>();
  const assignmentByShowEmployee = new Map<
    string,
    { activeFrom: string; activeUntil: string | null }
  >();
  for (const assignment of showAssignments) {
    const ids = assignmentIdsByShow.get(String(assignment.showId)) ?? new Set<string>();
    ids.add(String(assignment.employeeId));
    assignmentIdsByShow.set(String(assignment.showId), ids);
    assignmentByShowEmployee.set(`${String(assignment.showId)}:${String(assignment.employeeId)}`, {
      activeFrom: getWorkDate(assignment.activeFrom),
      activeUntil: assignment.activeUntil ? getWorkDate(assignment.activeUntil) : null,
    });
  }

  const audiences: ManagedCalendarDto['audiences'] = [];
  if (directReportGrants.length > 0) {
    audiences.push({
      type: 'direct_reports',
      id: 'direct-reports',
      code: null,
      label: 'My direct reports',
      memberCount: directReports.length,
    });
  }
  audiences.push(
    ...shows.map((show) => ({
      type: 'show' as const,
      id: String(show._id),
      code: show.code,
      label: show.name,
      memberCount: assignmentIdsByShow.get(String(show._id))?.size ?? 0,
    })),
  );

  let selectedAudience = audiences[0] ?? null;
  if (query.audienceType === 'direct_reports') {
    selectedAudience = audiences.find((audience) => audience.type === 'direct_reports') ?? null;
  } else if (query.audienceType === 'show') {
    selectedAudience =
      audiences.find((audience) => audience.type === 'show' && audience.id === query.showId) ??
      null;
  }
  if (query.audienceType && !selectedAudience) {
    throw new HttpError(403, 'This calendar is outside your assigned scope', 'SCOPE_FORBIDDEN');
  }
  if (!selectedAudience) return { month, audiences, selectedAudience: null, members: [] };

  const selectedEmployeeIds =
    selectedAudience.type === 'direct_reports'
      ? directReports.map((employee) => String(employee._id))
      : [...(assignmentIdsByShow.get(selectedAudience.id) ?? [])];
  if (selectedEmployeeIds.length === 0) {
    return { month, audiences, selectedAudience, members: [] };
  }

  const employeeObjectIds = validObjectIds(selectedEmployeeIds);
  const [employees, dailyTimecards, leaveRequests, holidayRows] = await Promise.all([
    Employee.find({ _id: { $in: employeeObjectIds }, status: 'active' })
      .select({ employeeCode: 1, firstName: 1, lastName: 1 })
      .sort({ firstName: 1, lastName: 1 })
      .lean()
      .exec(),
    DailyTimecard.find({
      employeeId: { $in: employeeObjectIds },
      workDate: { $gte: window.startDate, $lte: window.endDate },
    })
      .lean()
      .exec(),
    LeaveRequest.find({
      employeeId: { $in: employeeObjectIds },
      status: { $in: ['pending_manager', 'approved'] },
      workingDates: { $elemMatch: { $gte: window.startDate, $lte: window.endDate } },
    })
      .lean()
      .exec(),
    Promise.all(
      selectedEmployeeIds.map(async (employeeId) => ({
        employeeId,
        holidays: await listApplicableHolidays(employeeId, window.startDate, window.endDate),
      })),
    ),
  ]);

  const timecardByEmployeeDate = new Map<string, (typeof dailyTimecards)[number]>(
    dailyTimecards.map((record) => [`${String(record.employeeId)}:${record.workDate}`, record]),
  );
  const leaveByEmployeeDate = new Map<string, (typeof leaveRequests)[number]>(
    leaveRequests.flatMap((request) =>
      request.workingDates
        .filter((date) => date >= window.startDate && date <= window.endDate)
        .map((date) => [`${String(request.employeeId)}:${date}`, request] as const),
    ),
  );
  const holidayByEmployeeDate = new Map<string, (typeof holidayRows)[number]['holidays'][number]>(
    holidayRows.flatMap(({ employeeId, holidays }) =>
      holidays.map((holiday) => [`${employeeId}:${holiday.date}`, holiday] as const),
    ),
  );
  const today = getWorkDate(now);

  const members = employees.map((employee) => {
    const days: ManagedCalendarDayDto[] = [];
    for (
      let date = window.start;
      date <= window.end;
      date = new Date(date.getTime() + 86_400_000)
    ) {
      const isoDate = date.toISOString().slice(0, 10);
      const weekday = date.getUTCDay() || 7;
      const key = `${String(employee._id)}:${isoDate}`;
      const assignment =
        selectedAudience.type === 'show'
          ? assignmentByShowEmployee.get(`${selectedAudience.id}:${String(employee._id)}`)
          : null;
      const isAssigned =
        selectedAudience.type === 'direct_reports' ||
        Boolean(
          assignment &&
          isoDate >= assignment.activeFrom &&
          (!assignment.activeUntil || isoDate <= assignment.activeUntil),
        );
      if (!isAssigned) {
        days.push({
          date: isoDate,
          weekday,
          availability: 'not_assigned',
          attendanceStatus: null,
          leave: null,
          holiday: null,
        });
        continue;
      }
      const timecard = timecardByEmployeeDate.get(key);
      const leave = leaveByEmployeeDate.get(key);
      const holiday = holidayByEmployeeDate.get(key);
      const attendanceStatus = timecard?.calculated?.status ?? null;
      const leaveSummary = leave
        ? { dayPart: leave.dayPart, status: leave.status as 'pending_manager' | 'approved' }
        : null;
      days.push({
        date: isoDate,
        weekday,
        availability: resolveManagedCalendarAvailability({
          date: isoDate,
          weekday,
          today,
          holiday: Boolean(holiday),
          leave: leaveSummary,
          attendanceStatus,
        }),
        attendanceStatus,
        leave: leaveSummary,
        holiday: holiday ? { name: holiday.name, scopeType: holiday.scopeType } : null,
      });
    }
    return {
      employeeId: String(employee._id),
      employeeCode: employee.employeeCode,
      displayName: `${employee.firstName} ${employee.lastName}`.trim(),
      days,
    };
  });

  return { month, audiences, selectedAudience, members };
}
