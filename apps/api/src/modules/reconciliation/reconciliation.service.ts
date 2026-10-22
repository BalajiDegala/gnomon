import {
  defaultWorkdayPolicy,
  getWorkDate,
  getWorkdayWindow,
  type DailyAttendanceStatus,
  type DailyReconciliationDto,
  type LeaveDayPart,
  type ReconciliationAnomaly,
  type ReconciliationSource,
  type WorkSessionStatus,
} from '@gnomon/shared';

import { HttpError } from '../../middleware/errors.js';
import { AttendanceEvent, type AttendanceEventType } from '../attendance/attendance-event.model.js';
import { LeaveRequest } from '../leaves/leave.model.js';
import { findApplicableHoliday } from '../policies/holiday-applicability.service.js';
import { WorkSession } from '../timecard/work-session.model.js';
import { TimeEntry } from '../timesheets/time-entry.model.js';
import { RegularisationRequest } from '../regularisations/regularisation.model.js';
import { DailyTimecard } from './daily-timecard.model.js';

export const SOURCE_MISMATCH_TOLERANCE_MINUTES = 15;

export interface ReconciliationAttendanceEvent {
  source: 'biometric' | 'access_card';
  eventType: AttendanceEventType;
  occurredAt: Date;
}

export interface ReconciliationWorkSession {
  startedAt: Date;
  stoppedAt: Date | null;
  status: WorkSessionStatus;
}

export interface ReconciliationTimeEntry {
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  percentage: number;
}

export interface ReconciliationInput {
  workDate: string;
  now: Date;
  events: ReconciliationAttendanceEvent[];
  sessions: ReconciliationWorkSession[];
  timeEntries: ReconciliationTimeEntry[];
}

type ReconciliationCalculation = Omit<DailyReconciliationDto, 'id'>;
type BiometricSummary = DailyReconciliationDto['sourceSummary']['biometric'];
type AccessCardSummary = DailyReconciliationDto['sourceSummary']['accessCard'];
type WebsiteSummary = DailyReconciliationDto['sourceSummary']['website'];

export function applyApprovedLeaveToReconciliation(
  calculation: ReconciliationCalculation,
  dayPart: LeaveDayPart,
): ReconciliationCalculation {
  if (dayPart === 'full_day') {
    return {
      ...calculation,
      calculated: {
        ...calculation.calculated,
        status: 'leave',
        anomalies: [],
        provisional: false,
        requiresReview: false,
      },
    };
  }

  const requiredMinutes = Math.ceil(calculation.calculated.requiredMinutes / 2);
  const anomalies = calculation.calculated.anomalies.filter(
    (anomaly) =>
      anomaly !== 'insufficient_hours' || calculation.calculated.grossMinutes < requiredMinutes,
  );
  const hasCompletePrimaryEvidence =
    calculation.calculated.primarySource === 'biometric' &&
    calculation.sourceSummary.biometric.status === 'complete';
  return {
    ...calculation,
    calculated: {
      ...calculation.calculated,
      requiredMinutes,
      differenceMinutes: calculation.calculated.grossMinutes - requiredMinutes,
      status:
        hasCompletePrimaryEvidence && calculation.calculated.grossMinutes >= requiredMinutes
          ? 'present'
          : calculation.calculated.status,
      anomalies,
      requiresReview: anomalies.length > 0,
    },
  };
}

export function applyHolidayToReconciliation(
  calculation: ReconciliationCalculation,
): ReconciliationCalculation {
  return {
    ...calculation,
    calculated: {
      ...calculation.calculated,
      status: 'holiday',
      anomalies: [],
      provisional: false,
      requiresReview: false,
    },
  };
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function summarizeBiometric(events: ReconciliationAttendanceEvent[]): BiometricSummary {
  const ordered = events
    .filter((event) => event.source === 'biometric')
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const first = ordered.find((event) => event.eventType === 'in')?.occurredAt ?? null;
  const last =
    [...ordered].reverse().find((event) => event.eventType === 'out')?.occurredAt ?? null;
  const valid = Boolean(first && last && last > first);
  const status: BiometricSummary['status'] =
    ordered.length === 0
      ? 'none'
      : !first
        ? 'missing_in'
        : !last
          ? 'missing_out'
          : valid
            ? 'complete'
            : 'invalid';

  return {
    status,
    firstAt: first?.toISOString() ?? null,
    lastAt: last?.toISOString() ?? null,
    workedMinutes: valid ? minutesBetween(first!, last!) : 0,
    eventCount: ordered.length,
  };
}

function summarizeAccessCard(events: ReconciliationAttendanceEvent[]): AccessCardSummary {
  const ordered = events
    .filter((event) => event.source === 'access_card')
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const first = ordered.find((event) => event.eventType === 'entry')?.occurredAt ?? null;
  const last =
    [...ordered].reverse().find((event) => event.eventType === 'exit')?.occurredAt ?? null;
  const valid = Boolean(first && last && last > first);
  const status: AccessCardSummary['status'] =
    ordered.length === 0
      ? 'none'
      : !first
        ? 'missing_entry'
        : !last
          ? 'missing_exit'
          : valid
            ? 'complete'
            : 'invalid';

  return {
    status,
    firstAt: first?.toISOString() ?? null,
    lastAt: last?.toISOString() ?? null,
    workedMinutes: valid ? minutesBetween(first!, last!) : 0,
    eventCount: ordered.length,
  };
}

function summarizeWebsite(
  sessions: ReconciliationWorkSession[],
  now: Date,
  windowEnd: Date,
): WebsiteSummary {
  const ordered = [...sessions].sort(
    (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
  );
  if (ordered.length === 0) {
    return {
      status: 'none',
      firstAt: null,
      lastAt: null,
      workedMinutes: 0,
      sessionCount: 0,
    };
  }

  const cutoff = new Date(Math.min(now.getTime(), windowEnd.getTime()));
  const running = ordered.some((session) => session.status === 'running' && !session.stoppedAt);
  const incomplete = ordered.some(
    (session) => !session.stoppedAt && !(session.status === 'running' && now < windowEnd),
  );
  const stopped = ordered.flatMap((session) => (session.stoppedAt ? [session.stoppedAt] : []));
  const totalMinutes = ordered.reduce((total, session) => {
    const end = session.stoppedAt ?? cutoff;
    return total + minutesBetween(session.startedAt, end);
  }, 0);

  return {
    status: incomplete ? 'incomplete' : running ? 'running' : 'complete',
    firstAt: ordered[0]!.startedAt.toISOString(),
    lastAt: stopped.length ? stopped.at(-1)!.toISOString() : null,
    workedMinutes: totalMinutes,
    sessionCount: ordered.length,
  };
}

function isWorkingDay(workDate: string): boolean {
  const weekday = new Date(`${workDate}T00:00:00.000Z`).getUTCDay() || 7;
  return defaultWorkdayPolicy.workingWeekdays.includes(weekday);
}

function endpointsDiffer(
  left: { firstAt: string | null; lastAt: string | null },
  right: { firstAt: string | null; lastAt: string | null },
): boolean {
  if (!left.firstAt || !left.lastAt || !right.firstAt || !right.lastAt) return false;
  const tolerance = SOURCE_MISMATCH_TOLERANCE_MINUTES * 60_000;
  return (
    Math.abs(new Date(left.firstAt).getTime() - new Date(right.firstAt).getTime()) > tolerance ||
    Math.abs(new Date(left.lastAt).getTime() - new Date(right.lastAt).getTime()) > tolerance
  );
}

function selectPrimarySource(
  biometric: BiometricSummary,
  accessCard: AccessCardSummary,
  website: WebsiteSummary,
): ReconciliationSource {
  if (biometric.eventCount > 0) return 'biometric';
  if (accessCard.eventCount > 0) return 'access_card';
  if (website.sessionCount > 0) return 'website';
  return 'none';
}

export function calculateDailyReconciliation(
  input: ReconciliationInput,
): ReconciliationCalculation {
  const window = getWorkdayWindow(input.workDate);
  const workdayClosed = input.now >= window.end;
  const workingDay = isWorkingDay(input.workDate);
  const biometric = summarizeBiometric(input.events);
  const accessCard = summarizeAccessCard(input.events);
  const website = summarizeWebsite(input.sessions, input.now, window.end);
  const showEntries = {
    totalMinutes: input.timeEntries.reduce((total, entry) => total + entry.durationMinutes, 0),
    entryCount: input.timeEntries.length,
    averageProgress: input.timeEntries.length
      ? Math.round(
          input.timeEntries.reduce((total, entry) => total + entry.percentage, 0) /
            input.timeEntries.length,
        )
      : 0,
  };
  const primarySource = selectPrimarySource(biometric, accessCard, website);
  const primarySummary =
    primarySource === 'biometric'
      ? biometric
      : primarySource === 'access_card'
        ? accessCard
        : primarySource === 'website'
          ? website
          : null;
  const grossMinutes = primarySummary?.workedMinutes ?? 0;
  const attendanceStart = primarySummary?.firstAt ?? null;
  const attendanceEnd =
    primarySource === 'website' && website.status === 'running'
      ? new Date(Math.min(input.now.getTime(), window.end.getTime())).toISOString()
      : (primarySummary?.lastAt ?? null);
  const anomalies = new Set<ReconciliationAnomaly>();

  if (biometric.status === 'invalid' || accessCard.status === 'invalid') {
    anomalies.add('invalid_event_order');
  }

  if (workingDay && workdayClosed) {
    if (!biometric.firstAt) anomalies.add('missing_biometric_in');
    if (!biometric.lastAt) anomalies.add('missing_biometric_out');
    if (!accessCard.firstAt) anomalies.add('missing_access_entry');
    if (!accessCard.lastAt) anomalies.add('missing_access_exit');
    // Website timecards are optional supporting evidence. If an employee starts a
    // website session it still participates in reconciliation, but an entirely
    // absent website session must not turn a complete biometric/access-card day
    // into a review exception.
    if (website.sessionCount > 0 && !website.firstAt) anomalies.add('missing_web_start');
    if (website.sessionCount > 0 && (!website.lastAt || website.status === 'incomplete')) {
      anomalies.add('missing_web_stop');
    }
    if (grossMinutes < defaultWorkdayPolicy.requiredMinutes) anomalies.add('insufficient_hours');
  } else {
    if (biometric.status === 'missing_in') anomalies.add('missing_biometric_in');
    if (accessCard.status === 'missing_entry') anomalies.add('missing_access_entry');
  }

  const completeSources = [biometric, accessCard, website].filter(
    (source) => source.firstAt && source.lastAt && source.status === 'complete',
  );
  if (
    completeSources.some((source, index) =>
      completeSources.slice(index + 1).some((other) => endpointsDiffer(source, other)),
    )
  ) {
    anomalies.add('source_time_mismatch');
  }

  const sessionWindows = input.sessions.map((session) => ({
    start: session.startedAt,
    end: session.stoppedAt ?? new Date(Math.min(input.now.getTime(), window.end.getTime())),
  }));
  if (
    input.timeEntries.some(
      (entry) =>
        !sessionWindows.some(
          (session) => entry.startedAt >= session.start && entry.endedAt <= session.end,
        ),
    )
  ) {
    anomalies.add('show_time_outside_web_session');
  }
  const knownPresenceMinutes = Math.max(
    biometric.workedMinutes,
    accessCard.workedMinutes,
    website.workedMinutes,
  );
  if (
    showEntries.totalMinutes > 0 &&
    showEntries.totalMinutes > knownPresenceMinutes + SOURCE_MISMATCH_TOLERANCE_MINUTES
  ) {
    anomalies.add('show_time_exceeds_presence');
  }

  let status: DailyAttendanceStatus = 'partial';
  if (!workingDay) status = 'weekend';
  else if (
    biometric.status === 'complete' &&
    grossMinutes >= defaultWorkdayPolicy.requiredMinutes
  ) {
    status = 'present';
  } else if (
    workdayClosed &&
    biometric.eventCount === 0 &&
    accessCard.eventCount === 0 &&
    website.sessionCount === 0
  ) {
    status = 'absent';
  }

  const anomalyList = [...anomalies];
  return {
    workDate: input.workDate,
    timezone: defaultWorkdayPolicy.timezone,
    window: {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      expectedStart: window.expectedStart.toISOString(),
      expectedEnd: window.expectedEnd.toISOString(),
      requiredMinutes: defaultWorkdayPolicy.requiredMinutes,
    },
    sourceSummary: { biometric, accessCard, website, showEntries },
    calculated: {
      primarySource,
      attendanceStart,
      attendanceEnd,
      grossMinutes,
      breakMinutes: 0,
      payableMinutes: grossMinutes,
      requiredMinutes: defaultWorkdayPolicy.requiredMinutes,
      differenceMinutes: grossMinutes - defaultWorkdayPolicy.requiredMinutes,
      status,
      anomalies: anomalyList,
      workdayClosed,
      provisional: primarySource !== 'biometric',
      requiresReview: anomalyList.length > 0,
    },
    generatedAt: input.now.toISOString(),
  };
}

let indexesReady: Promise<unknown> | null = null;

function ensureIndexes(): Promise<unknown> {
  indexesReady ??= DailyTimecard.createIndexes();
  return indexesReady;
}

export async function reconcileDailyTimecard(
  employeeId: string,
  workDate = getWorkDate(new Date()),
  now = new Date(),
): Promise<DailyReconciliationDto> {
  await ensureIndexes();
  if (workDate > getWorkDate(now)) {
    throw new HttpError(400, 'A future work date cannot be reconciled', 'FUTURE_WORK_DATE');
  }
  const [events, sessions, timeEntries, regularisations, approvedLeave, holiday] =
    await Promise.all([
      AttendanceEvent.find({ employeeId, workDate, removedAt: null })
        .select({ source: 1, eventType: 1, occurredAt: 1 })
        .lean()
        .exec(),
      WorkSession.find({ employeeId, workDate })
        .select({ startedAt: 1, stoppedAt: 1, status: 1 })
        .lean()
        .exec(),
      TimeEntry.find({ employeeId, workDate })
        .select({ startedAt: 1, endedAt: 1, durationMinutes: 1, percentage: 1 })
        .lean()
        .exec(),
      RegularisationRequest.find({
        employeeId,
        workDate,
        status: { $in: ['pending_manager', 'pending_hr', 'approved', 'rejected'] },
      })
        .sort({ submittedAt: -1 })
        .lean()
        .exec(),
      LeaveRequest.findOne({ employeeId, status: 'approved', workingDates: workDate })
        .lean()
        .exec(),
      findApplicableHoliday(employeeId, workDate),
    ]);
  const calculation = calculateDailyReconciliation({
    workDate,
    now,
    events,
    sessions,
    timeEntries,
  });
  const pendingRegularisation = regularisations.find((request) =>
    ['pending_manager', 'pending_hr'].includes(request.status),
  );
  const approvedRegularisation = regularisations.find((request) => request.status === 'approved');
  const latestRegularisation = regularisations[0];
  const regularisationStatus = pendingRegularisation
    ? 'pending'
    : approvedRegularisation
      ? 'approved'
      : latestRegularisation?.status === 'rejected'
        ? 'rejected'
        : 'not_required';
  const finalApproval = approvedRegularisation?.decisions.find(
    (decision) => decision.step === 2 && decision.decision === 'approved',
  );
  const fullDayLeave = approvedLeave?.dayPart === 'full_day';
  const effectiveCalculation =
    approvedLeave && !approvedRegularisation
      ? applyApprovedLeaveToReconciliation(calculation, approvedLeave.dayPart)
      : holiday && !approvedRegularisation
        ? applyHolidayToReconciliation(calculation)
        : calculation;
  const persistedCalculation: Record<string, unknown> = {
    ...effectiveCalculation,
    regularisationStatus,
    finalisation: approvedRegularisation
      ? {
          isFinal: true,
          finalSource: 'regularised',
          finalStart: approvedRegularisation.requestedStart,
          finalEnd: approvedRegularisation.requestedEnd,
          finalMinutes: approvedRegularisation.requestedMinutes,
          finalisedBy: finalApproval?.actorUserId ?? null,
          finalisedAt: finalApproval?.decidedAt ?? approvedRegularisation.updatedAt,
        }
      : fullDayLeave
        ? {
            isFinal: true,
            finalSource: 'approved_leave',
            finalStart: null,
            finalEnd: null,
            finalMinutes: 0,
            finalisedBy: approvedLeave.decision?.actorUserId ?? null,
            finalisedAt: approvedLeave.decision?.decidedAt ?? approvedLeave.updatedAt,
          }
        : holiday && !approvedLeave
          ? {
              isFinal: true,
              finalSource: 'holiday',
              finalStart: null,
              finalEnd: null,
              finalMinutes: 0,
              finalisedBy: holiday.updatedByUserId,
              finalisedAt: holiday.updatedAtDate,
            }
          : {
              isFinal: false,
              finalSource: 'calculated',
              finalStart: effectiveCalculation.calculated.attendanceStart,
              finalEnd: effectiveCalculation.calculated.attendanceEnd,
              finalMinutes: effectiveCalculation.calculated.payableMinutes,
              finalisedBy: null,
              finalisedAt: null,
            },
  };

  const record = await DailyTimecard.findOneAndUpdate(
    { employeeId, workDate },
    {
      $set: persistedCalculation,
      $inc: { version: 1 },
    },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
      setDefaultsOnInsert: false,
    },
  )
    .select({ _id: 1 })
    .lean()
    .exec();

  return { id: String(record!._id), ...effectiveCalculation };
}
