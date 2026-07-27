import { getWorkDate, type PersonalCalendarDto } from '@gnomon/shared';

import { LeaveRequest } from '../leaves/leave.model.js';
import { listApplicableHolidays } from '../policies/holiday-applicability.service.js';
import { DailyTimecard } from '../reconciliation/daily-timecard.model.js';

function monthWindow(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { start, end, startDate: `${month}-01`, endDate: end.toISOString().slice(0, 10) };
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
