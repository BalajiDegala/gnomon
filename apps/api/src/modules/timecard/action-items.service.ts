import {
  getWorkDate,
  type AttendanceActionItem,
  type AttendanceActionItemsDto,
} from '@gnomon/shared';

import { LeaveRequest } from '../leaves/leave.model.js';
import { listApplicableHolidays } from '../policies/holiday-applicability.service.js';
import { DailyTimecard } from '../reconciliation/daily-timecard.model.js';
import { RegularisationRequest } from '../regularisations/regularisation.model.js';
import { WorkSession } from './work-session.model.js';

const DEFAULT_SHIFT_START = '09:30';
const DEFAULT_SHIFT_END = '18:30';
const DEFAULT_REQUIRED_MINUTES = 9 * 60;

const issueLabels: Record<string, string> = {
  missing_biometric_in: 'No biometric entry',
  missing_biometric_out: 'No biometric exit',
  missing_access_entry: 'No access-card entry',
  missing_access_exit: 'No access-card exit',
  missing_web_start: 'Timecard not started',
  missing_web_stop: 'Timecard not stopped',
  insufficient_hours: 'Short hours',
  source_time_mismatch: 'Sources disagree',
  invalid_event_order: 'Punches out of order',
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** India-time wall clock on a date, as an instant. */
function indiaInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

/**
 * Past working days (from the previous month's first day up to yesterday)
 * whose daily record is absent (LOP) or partial and that are not yet covered by
 * leave, a regularisation or a holiday. Only days that have a daily record are
 * considered: the system creates an absent record for every active employee at
 * the start of each working day, so days before Gnomon ran are never flagged.
 */
export async function listAttendanceActionItems(
  employeeId: string,
  now = new Date(),
): Promise<AttendanceActionItemsDto> {
  const today = getWorkDate(now);
  const toDate = addDays(today, -1);
  const previousMonthStart = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;

  const fromDate = previousMonthStart;
  if (fromDate > toDate) return { fromDate, toDate, items: [] };

  const [timecards, leaves, regularisations, holidays] = await Promise.all([
    DailyTimecard.find({
      employeeId,
      workDate: { $gte: fromDate, $lte: toDate },
      'calculated.status': { $in: ['absent', 'partial'] },
    })
      .sort({ workDate: 1 })
      .lean()
      .exec(),
    LeaveRequest.find({
      employeeId,
      status: { $in: ['pending_manager', 'pending_hr', 'approved'] },
      workingDates: { $elemMatch: { $gte: fromDate, $lte: toDate } },
    })
      .select({ workingDates: 1 })
      .lean()
      .exec(),
    RegularisationRequest.find({
      employeeId,
      status: { $in: ['pending_manager', 'pending_hr', 'approved'] },
      workDate: { $gte: fromDate, $lte: toDate },
    })
      .select({ workDate: 1 })
      .lean()
      .exec(),
    listApplicableHolidays(employeeId, fromDate, toDate),
  ]);
  const covered = new Set<string>([
    ...leaves.flatMap((leave) => leave.workingDates),
    ...regularisations.map((request) => request.workDate),
    ...holidays.map((holiday) => holiday.date),
  ]);

  const items: AttendanceActionItem[] = [];
  for (const record of timecards) {
    const date = record.workDate;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    if (weekday > 5 || covered.has(date)) continue;
    const status = record.calculated?.status;
    if (status !== 'absent' && status !== 'partial') continue;
    if (['pending', 'approved'].includes(record.regularisationStatus)) continue;

    const anomalies: string[] = record?.calculated?.anomalies ?? [];
    const expectedStart =
      record?.window?.expectedStart?.toISOString() ?? indiaInstant(date, DEFAULT_SHIFT_START);
    const expectedEnd =
      record?.window?.expectedEnd?.toISOString() ?? indiaInstant(date, DEFAULT_SHIFT_END);
    const detectedStart = record?.calculated?.attendanceStart?.toISOString() ?? null;
    const detectedEnd = record?.calculated?.attendanceEnd?.toISOString() ?? null;
    const missingOpening = anomalies.some((code) =>
      ['missing_biometric_in', 'missing_access_entry', 'missing_web_start'].includes(code),
    );
    const missingClosing = anomalies.some((code) =>
      ['missing_biometric_out', 'missing_access_exit', 'missing_web_stop'].includes(code),
    );
    const primary = record?.calculated?.primarySource;
    const source =
      primary === 'biometric' || primary === 'access_card' || primary === 'website'
        ? primary
        : anomalies.some((code) => code.includes('access'))
          ? 'access_card'
          : anomalies.some((code) => code.includes('biometric'))
            ? 'biometric'
            : 'website';

    items.push({
      workDate: date,
      kind: status,
      suggestedAction: status === 'absent' ? 'leave' : 'regularisation',
      workedMinutes: record?.calculated?.grossMinutes ?? 0,
      requiredMinutes: record?.calculated?.requiredMinutes ?? DEFAULT_REQUIRED_MINUTES,
      detectedStart,
      detectedEnd,
      expectedStart,
      expectedEnd,
      source,
      missingEvent:
        missingOpening && !missingClosing
          ? 'opening'
          : missingClosing && !missingOpening
            ? 'closing'
            : 'both',
      issues:
        status === 'absent'
          ? ['No attendance recorded']
          : [
              ...new Set(
                anomalies.flatMap((code) => (issueLabels[code] ? [issueLabels[code]!] : [])),
              ),
            ],
    });
  }
  await attachAutoStops(employeeId, items);
  return { fromDate, toDate, items: items.reverse() };
}

/**
 * Days whose timecard was stopped automatically at 07:00 get the stop details so
 * the employee can confirm it or request a corrected exit time (prefilled with
 * the shift end, the next morning for overnight shifts).
 */
async function attachAutoStops(employeeId: string, items: AttendanceActionItem[]): Promise<void> {
  const dates = items.filter((item) => item.kind === 'partial').map((item) => item.workDate);
  if (dates.length === 0) return;
  const sessions = await WorkSession.find({
    employeeId,
    workDate: { $in: dates },
    status: 'auto_stopped',
  })
    .select({ workDate: 1, startedAt: 1, stoppedAt: 1, shiftEndTime: 1 })
    .sort({ startedAt: 1 })
    .lean()
    .exec();
  for (const session of sessions) {
    const item = items.find((candidate) => candidate.workDate === session.workDate);
    if (!item || !session.stoppedAt) continue;
    let suggestedEnd = new Date(
      indiaInstant(session.workDate, session.shiftEndTime || DEFAULT_SHIFT_END),
    );
    if (suggestedEnd <= session.startedAt) {
      suggestedEnd = new Date(suggestedEnd.getTime() + 24 * 60 * 60_000);
    }
    if (suggestedEnd > session.stoppedAt || suggestedEnd <= session.startedAt) {
      suggestedEnd = session.stoppedAt;
    }
    item.autoStopped = {
      sessionId: String(session._id),
      startedAt: session.startedAt.toISOString(),
      stoppedAt: session.stoppedAt.toISOString(),
      suggestedEnd: suggestedEnd.toISOString(),
    };
    item.source = 'website';
    item.missingEvent = 'closing';
    item.suggestedAction = 'regularisation';
    item.issues = ['Timecard stopped automatically at 07:00'];
  }
}
