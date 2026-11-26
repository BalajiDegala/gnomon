import { getWorkDate, getWorkdayWindow } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { recordEvent } from '../system-events/system-event.service.js';
import { WorkSession, type WorkSessionDocument } from './work-session.model.js';

export const AUTO_STOP_METADATA = {
  ipAddress: 'system',
  userAgent: 'Stopped automatically at the 07:00 workday boundary',
};

/**
 * Stops one session left running past its workday: the stop is the 07:00
 * boundary that ends that workday, and the session waits for the employee to
 * confirm it or request a corrected exit time from Catch-up. Returns false when
 * the session was already stopped (another replica or the employee got there first).
 */
export async function autoStopSession(
  session: Pick<
    WorkSessionDocument,
    '_id' | 'employeeId' | 'workDate' | 'startedAt' | 'startMetadata'
  >,
): Promise<boolean> {
  const stoppedAt = getWorkdayWindow(session.workDate).end;
  const durationMinutes = Math.max(
    0,
    Math.floor((stoppedAt.getTime() - session.startedAt.getTime()) / 60_000),
  );
  const result = await WorkSession.updateOne(
    { _id: session._id, status: 'running' },
    {
      $set: {
        status: 'auto_stopped',
        stoppedAt,
        durationMinutes,
        stopMetadata: AUTO_STOP_METADATA,
        stoppedBy: null,
      },
    },
  ).exec();
  if (result.modifiedCount === 0) return false;
  recordEvent({
    category: 'timecard',
    action: 'timecard.auto_stopped',
    severity: 'warn',
    message: `Timecard left running on ${session.workDate} was stopped at 07:00; waiting for the employee to confirm`,
    subject: {
      type: 'work_session',
      id: String(session._id),
      employeeCode: null,
      label: session.workDate,
    },
    metadata: {
      employeeId: String(session.employeeId),
      workDate: session.workDate,
      startedAt: session.startedAt,
      stoppedAt,
      durationMinutes,
      startedFrom: session.startMetadata,
    },
  });
  return true;
}

/** Stops every session still running from an earlier workday and refreshes those days. */
export async function autoStopStaleSessions(now = new Date()): Promise<{ stopped: number }> {
  const today = getWorkDate(now);
  const stale = await WorkSession.find({ status: 'running', workDate: { $lt: today } })
    .select({ employeeId: 1, workDate: 1, startedAt: 1, startMetadata: 1 })
    .lean()
    .exec();
  let stopped = 0;
  for (const session of stale) {
    if (!(await autoStopSession(session))) continue;
    stopped += 1;
    try {
      await reconcileDailyTimecard(String(session.employeeId), session.workDate, now);
    } catch {
      // The day is reconciled again when viewed or by the next run.
    }
  }
  return { stopped };
}

/** The employee confirms that the automatic 07:00 stop is their real exit time. */
export async function confirmAutoStop(
  employeeId: string,
  userId: string,
  sessionId: string,
  now = new Date(),
): Promise<{ workDate: string }> {
  const session = await WorkSession.findOneAndUpdate(
    { _id: sessionId, employeeId, status: 'auto_stopped' },
    {
      $set: {
        status: 'completed',
        stopConfirmedAt: now,
        stoppedBy: new Types.ObjectId(userId),
      },
    },
    { returnDocument: 'after' },
  )
    .lean()
    .exec();
  if (!session) {
    throw new HttpError(
      409,
      'This timecard is not waiting for confirmation (it may already be confirmed or corrected)',
      'AUTO_STOP_NOT_PENDING',
    );
  }
  await reconcileDailyTimecard(employeeId, session.workDate, now);
  return { workDate: session.workDate };
}
