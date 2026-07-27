import { getWorkDate, type TodayTimecard, type WorkSessionDto } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
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
  const sessions = await WorkSession.find({ employeeId, workDate }).sort({ startedAt: 1 }).exec();
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
    serverNow: now.toISOString(),
  };
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
  now = new Date(),
): Promise<TodayTimecard> {
  const workDate = getWorkDate(now);
  const runningSession = await WorkSession.findOne({ employeeId, status: 'running' }).exec();

  if (runningSession) {
    const isStale = runningSession.workDate !== workDate;
    throw new HttpError(
      409,
      isStale
        ? `A session from ${runningSession.workDate} is still open and requires regularisation`
        : 'Your timecard is already running',
      isStale ? 'STALE_OPEN_SESSION' : 'TIMECARD_ALREADY_RUNNING',
    );
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

  return getTodayTimecard(employeeId, now);
}
