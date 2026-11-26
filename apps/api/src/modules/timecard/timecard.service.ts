import {
  emptyWorkContext,
  getWorkDate,
  type StartTimecardRequest,
  type TodayTimecard,
  type WorkContext,
  type WorkMode,
  type WorkSessionDto,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { describeEvent } from '../system-events/request-context.js';
import { HttpError } from '../../middleware/errors.js';
import { LeaveRequest } from '../leaves/leave.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { listShifts, resolveShiftForStart } from '../shifts/shift.service.js';
import { autoStopSession } from './auto-stop.service.js';
import { WorkSession, type WorkSessionDocument } from './work-session.model.js';

export interface ClientMetadata {
  ipAddress: string;
  userAgent: string;
}

function toDto(session: WorkSessionDocument): WorkSessionDto {
  return {
    id: String(session._id),
    workDate: session.workDate,
    startedAt: session.startedAt.toISOString(),
    stoppedAt: session.stoppedAt?.toISOString() ?? null,
    durationMinutes: session.durationMinutes,
    status: session.status,
    shiftName: session.shiftName ?? null,
    workMode: session.workMode ?? null,
  };
}

export interface WorkContextSource {
  startedAt: Date;
  shiftId?: unknown;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  workMode?: WorkMode | null;
}

/** The first session that recorded a shift or work mode decides the day's work context. */
export function workContextFromSessions(sessions: readonly WorkContextSource[]): WorkContext {
  const ordered = [...sessions].sort(
    (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
  );
  const declared = ordered.find((session) => session.shiftName || session.workMode);
  if (!declared) return emptyWorkContext;
  const workModes = [
    ...new Set(ordered.flatMap((session) => (session.workMode ? [session.workMode] : []))),
  ];
  return {
    shiftId: declared.shiftId ? String(declared.shiftId) : null,
    shiftName: declared.shiftName ?? null,
    shiftStartTime: declared.shiftStartTime ?? null,
    shiftEndTime: declared.shiftEndTime ?? null,
    workMode: workModes[0] ?? null,
    workModes,
  };
}

function elapsedSeconds(session: WorkSessionDocument, now: Date): number {
  const end = session.stoppedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - session.startedAt.getTime()) / 1_000));
}

export async function getTodayTimecard(
  employeeId: string,
  now = new Date(),
): Promise<TodayTimecard> {
  const workDate = getWorkDate(now);
  const [sessions, leave] = await Promise.all([
    WorkSession.find({ employeeId, workDate }).sort({ startedAt: 1 }).exec(),
    LeaveRequest.findOne({
      employeeId,
      workingDates: workDate,
      status: { $in: ['pending_manager', 'pending_hr', 'approved'] },
    })
      .select({ leaveType: 1, dayPart: 1, status: 1 })
      .lean()
      .exec(),
  ]);
  const activeSession = sessions.find((session) => session.status === 'running') ?? null;

  return {
    workDate,
    state: activeSession ? 'running' : sessions.length > 0 ? 'completed' : 'not_started',
    activeSession: activeSession ? toDto(activeSession) : null,
    sessions: sessions.map(toDto),
    totalTrackedSeconds: sessions.reduce(
      (total, session) => total + elapsedSeconds(session, now),
      0,
    ),
    workContext: workContextFromSessions(sessions),
    shifts: await listShifts({ activeOnly: true }),
    serverNow: now.toISOString(),
    leave: leave
      ? {
          requestId: String(leave._id),
          leaveType: leave.leaveType,
          dayPart: leave.dayPart,
          status: leave.status,
        }
      : null,
  };
}

/** Work recorded on dates in a range, used to warn before applying leave on them. */
export async function getRecordedWorkDays(
  employeeId: string,
  startDate: string,
  endDate: string,
  now = new Date(),
): Promise<Array<{ workDate: string; trackedMinutes: number; running: boolean }>> {
  const sessions = await WorkSession.find({
    employeeId,
    workDate: { $gte: startDate, $lte: endDate },
  })
    .select({ workDate: 1, startedAt: 1, stoppedAt: 1, status: 1 })
    .lean()
    .exec();
  const byDate = new Map<string, { trackedMinutes: number; running: boolean }>();
  for (const session of sessions) {
    const end = session.stoppedAt ?? (session.status === 'running' ? now : session.startedAt);
    const minutes = Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 60_000));
    const day = byDate.get(session.workDate) ?? { trackedMinutes: 0, running: false };
    day.trackedMinutes += minutes;
    day.running ||= session.status === 'running';
    byDate.set(session.workDate, day);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([workDate, day]) => ({ workDate, ...day }));
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function startTimecard(
  employeeId: string,
  metadata: ClientMetadata,
  input: StartTimecardRequest = {},
  now = new Date(),
): Promise<TodayTimecard> {
  const workDate = getWorkDate(now);
  const runningSession = await WorkSession.findOne({ employeeId, status: 'running' }).exec();

  if (runningSession?.workDate === workDate) {
    throw new HttpError(409, 'Your timecard is already running', 'TIMECARD_ALREADY_RUNNING');
  }
  if (runningSession) {
    // A session left open on an earlier day must not block today's work (the
    // 07:00 job may not have run yet). Stop it at 07:00 like the job does; the
    // employee confirms it or corrects the exit time from Catch-up.
    if (await autoStopSession(runningSession)) {
      await reconcileDailyTimecard(employeeId, runningSession.workDate, now).catch(() => undefined);
    }
  }

  // The shift is declared once per work date: later sessions inherit it. The
  // work mode is chosen for each session, so someone can stop at the office and
  // start again from home on the same day.
  const earlierSessions = await WorkSession.find({ employeeId, workDate })
    .select({
      startedAt: 1,
      shiftId: 1,
      shiftName: 1,
      shiftStartTime: 1,
      shiftEndTime: 1,
      workMode: 1,
    })
    .lean()
    .exec();
  const lockedContext = workContextFromSessions(earlierSessions);
  const workMode = input.workMode ?? 'office';
  let context: Omit<WorkContext, 'workModes'>;
  if (lockedContext.shiftName) {
    context = { ...lockedContext, workMode };
  } else {
    const shift = await resolveShiftForStart(input.shiftId);
    context = {
      shiftId: String(shift._id),
      shiftName: shift.name,
      shiftStartTime: shift.startTime,
      shiftEndTime: shift.endTime,
      workMode,
    };
  }

  try {
    await WorkSession.create({
      employeeId: new Types.ObjectId(employeeId),
      workDate,
      startedAt: now,
      stoppedAt: null,
      durationMinutes: null,
      status: 'running',
      startMetadata: metadata,
      stopMetadata: null,
      stoppedBy: null,
      correctionRequestId: null,
      shiftId: context.shiftId ? new Types.ObjectId(context.shiftId) : null,
      shiftName: context.shiftName,
      shiftStartTime: context.shiftStartTime,
      shiftEndTime: context.shiftEndTime,
      workMode: context.workMode,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'Your timecard is already running', 'TIMECARD_ALREADY_RUNNING');
    }
    throw error;
  }

  return getTodayTimecard(employeeId, now);
}

export async function stopTimecard(
  employeeId: string,
  userId: string,
  metadata: ClientMetadata,
  now = new Date(),
): Promise<TodayTimecard> {
  const session = await WorkSession.findOne({ employeeId, status: 'running' }).exec();

  if (!session) {
    throw new HttpError(409, 'There is no running timecard to stop', 'TIMECARD_NOT_RUNNING');
  }

  const elapsedMilliseconds = now.getTime() - session.startedAt.getTime();
  if (elapsedMilliseconds < 0) {
    throw new HttpError(409, 'The session start time is invalid', 'INVALID_SESSION_TIME');
  }

  const stoppedSession = await WorkSession.findOneAndUpdate(
    { _id: session._id, status: 'running' },
    {
      $set: {
        stoppedAt: now,
        durationMinutes: Math.floor(elapsedMilliseconds / 60_000),
        status: 'completed',
        stopMetadata: metadata,
        stoppedBy: new Types.ObjectId(userId),
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).exec();

  if (!stoppedSession) {
    throw new HttpError(409, 'The timecard was already stopped', 'TIMECARD_ALREADY_STOPPED');
  }

  // Stopping from another machine is allowed; record it so the log shows where.
  const differentMachine =
    session.startMetadata.ipAddress !== metadata.ipAddress ||
    session.startMetadata.userAgent !== metadata.userAgent;
  describeEvent({
    message: differentMachine ? 'Stopped workday from a different machine' : 'Stopped workday',
    metadata: {
      workDate: session.workDate,
      durationMinutes: stoppedSession.durationMinutes,
      startedFrom: session.startMetadata,
      stoppedFrom: metadata,
      differentMachine,
    },
  });

  return getTodayTimecard(employeeId, now);
}
