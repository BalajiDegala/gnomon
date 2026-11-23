import { getWorkDate } from '@gnomon/shared';
import type { Logger } from 'pino';

import { Employee } from '../employees/employee.model.js';
import { DailyTimecard } from './daily-timecard.model.js';
import { isWorkingDay, reconcileDailyTimecard } from './reconciliation.service.js';
import { recordEvent } from '../system-events/system-event.service.js';

const RUN_INTERVAL_MS = 15 * 60_000;
const CONCURRENCY = 10;
const DAY_MS = 24 * 60 * 60_000;

/**
 * Employees who should have an attendance row every working day: active people
 * from the HR directory. Profiles auto-created from door or biometric imports
 * are excluded because they are usually unlinked duplicates of directory people.
 */
const rosterFilter = {
  status: 'active' as const,
  profileSource: { $in: ['users_csv' as const, 'manual' as const] },
};

async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * Creates the default LOP row for every rostered employee who has no daily
 * record yet. Existing rows are left untouched; evidence arriving later
 * (imports, timecard starts) re-reconciles them to partial or present.
 * Leave and holidays are applied by reconciliation itself.
 */
export async function ensureDailyAttendanceRecords(
  workDate: string,
  now = new Date(),
): Promise<{ created: number; failed: number }> {
  if (!isWorkingDay(workDate) || workDate > getWorkDate(now)) return { created: 0, failed: 0 };

  // Only days on or after the employee was added to Gnomon: a newly imported
  // person must not be back-filled as LOP for days before they existed here.
  const employees = (
    await Employee.find(rosterFilter).select({ _id: 1, createdAt: 1 }).lean().exec()
  ).filter((employee) => !employee.createdAt || getWorkDate(employee.createdAt) <= workDate);
  const existing = new Set(
    (
      await DailyTimecard.find({
        workDate,
        employeeId: { $in: employees.map((employee) => employee._id) },
      })
        .select({ employeeId: 1 })
        .lean()
        .exec()
    ).map((record) => String(record.employeeId)),
  );
  const missing = employees
    .map((employee) => String(employee._id))
    .filter((employeeId) => !existing.has(employeeId));

  let failed = 0;
  await runWithConcurrency(missing, async (employeeId) => {
    try {
      await reconcileDailyTimecard(employeeId, workDate, now);
    } catch {
      failed += 1;
    }
  });
  return { created: missing.length - failed, failed };
}

/**
 * Runs at startup and every 15 minutes so rows appear shortly after the 07:00
 * workday boundary. Yesterday is included to fill gaps after downtime. The work
 * is idempotent, so several API replicas can run it safely.
 */
export function startDailyAttendanceScheduler(logger: Logger): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const workDates = [
        ...new Set([getWorkDate(new Date(now.getTime() - DAY_MS)), getWorkDate(now)]),
      ];
      for (const workDate of workDates) {
        const result = await ensureDailyAttendanceRecords(workDate, now);
        if (result.created || result.failed) {
          logger.info({ workDate, ...result }, 'Default LOP attendance rows created');
          recordEvent({
            category: 'job',
            action: 'job.daily_attendance',
            severity: result.failed ? 'warn' : 'info',
            outcome: result.failed ? 'failure' : 'success',
            message: `Daily attendance for ${workDate}: ${result.created} rows created, ${result.failed} failed`,
            metadata: { workDate, ...result },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Default LOP attendance generation failed');
      recordEvent({
        category: 'job',
        action: 'job.daily_attendance',
        severity: 'error',
        outcome: 'failure',
        message: 'Daily attendance generation failed',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.slice(0, 4_000) : null,
        },
      });
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), RUN_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
