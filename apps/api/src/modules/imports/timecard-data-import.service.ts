import type { TimecardDataImportResponse } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { User } from '../auth/user.model.js';
import { Employee } from '../employees/employee.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { Show } from '../shows/show.model.js';
import { WorkSession } from '../timecard/work-session.model.js';
import { TimeEntry } from '../timesheets/time-entry.model.js';
import {
  parseTimecardData,
  splitMinutes,
  type ParsedTimecardRecord,
} from './timecard-data.parser.js';

export const TIMECARD_IMPORT_SOURCE = 'legacy_timecard';

export interface TimecardDataImportInput {
  fileName: string;
  jsonText: string;
  importedBy: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve legacy logins the same way sign-in does: the directory User ID first,
 * then the part of the account email before the @. Ambiguous logins don't match.
 */
async function resolveLogins(logins: string[]): Promise<Map<string, Types.ObjectId>> {
  const resolved = new Map<string, Types.ObjectId>();
  for (const login of logins) {
    const pattern = new RegExp(`^${escapeRegex(login)}$`, 'i');
    const byUserId = await Employee.find({ 'hrProfile.userId': pattern, status: 'active' })
      .select({ _id: 1 })
      .limit(2)
      .lean()
      .exec();
    if (byUserId.length === 1) {
      resolved.set(login, byUserId[0]!._id as Types.ObjectId);
      continue;
    }
    if (byUserId.length > 1) continue;
    const users = await User.find({
      email: new RegExp(`^${escapeRegex(login)}@`, 'i'),
      status: 'active',
    })
      .select({ employeeId: 1 })
      .limit(2)
      .lean()
      .exec();
    if (users.length === 1) {
      const active = await Employee.exists({ _id: users[0]!.employeeId, status: 'active' });
      if (active) resolved.set(login, users[0]!.employeeId as Types.ObjectId);
    }
  }
  return resolved;
}

async function ensureShows(
  codes: string[],
  createdBy: Types.ObjectId,
): Promise<{ showIdByCode: Map<string, Types.ObjectId>; created: string[] }> {
  const existing = await Show.find({ code: { $in: codes } })
    .select({ code: 1 })
    .lean()
    .exec();
  const showIdByCode = new Map(existing.map((show) => [show.code, show._id as Types.ObjectId]));
  const created: string[] = [];
  for (const code of codes.filter((value) => !showIdByCode.has(value))) {
    try {
      const show = await Show.create({ code, name: code, status: 'active', createdBy });
      showIdByCode.set(code, show._id);
      created.push(code);
    } catch {
      // Created concurrently by another import or an administrator.
      const show = await Show.findOne({ code }).select({ _id: 1 }).lean().exec();
      if (show) showIdByCode.set(code, show._id as Types.ObjectId);
    }
  }
  return { showIdByCode, created };
}

/** Website (non-imported) sessions that overlap the imported window would double count. */
async function overlapsWebsiteSession(
  employeeId: Types.ObjectId,
  record: ParsedTimecardRecord,
): Promise<boolean> {
  const end = record.stoppedAt ?? record.startedAt;
  return Boolean(
    await WorkSession.exists({
      employeeId,
      workDate: record.workDate,
      importRef: null,
      startedAt: { $lte: end },
      $or: [{ stoppedAt: null }, { stoppedAt: { $gte: record.startedAt } }],
    }),
  );
}

/**
 * Import timecard records exported from the legacy timecard application. Each
 * record becomes that day's work session (start to stop, India time) and one
 * timesheet entry per project, with the day's work_time split evenly across
 * projects. Re-importing a file updates the records it created before.
 */
export async function importTimecardData(
  input: TimecardDataImportInput,
): Promise<TimecardDataImportResponse> {
  const parsed = parseTimecardData(input.jsonText);
  if (parsed.totalRecords === 0 && parsed.errors.length > 0) {
    throw new HttpError(400, parsed.errors[0]!.reason, 'INVALID_TIMECARD_FILE');
  }

  const importedBy = new Types.ObjectId(input.importedBy);
  const errors = [...parsed.errors];
  const logins = [...new Set(parsed.records.map((record) => record.login))];
  const employeeByLogin = await resolveLogins(logins);
  const unmatchedLogins = logins.filter((login) => !employeeByLogin.has(login)).sort();

  const matched = parsed.records.filter((record) => employeeByLogin.has(record.login));
  for (const record of parsed.records) {
    if (!employeeByLogin.has(record.login)) {
      errors.push({
        rowNumber: record.rowNumber,
        login: record.login,
        reason: 'No active Gnomon user has this login',
      });
    }
  }

  const codes = [
    ...new Set(
      matched
        .filter((record) => record.workMinutes > 0)
        .flatMap((record) => record.projects.map((project) => project.code)),
    ),
  ];
  const { showIdByCode, created: showsCreated } = await ensureShows(codes, importedBy);

  const metadata = {
    ipAddress: 'import',
    userAgent: `Timecard import: ${input.fileName}`.slice(0, 1_024),
  };
  const affectedDays = new Map<string, { employeeId: string; workDate: string }>();
  let importedRecords = 0;
  let sessionsCreated = 0;
  let sessionsUpdated = 0;
  let openSessions = 0;
  let timesheetEntries = 0;

  for (const record of matched) {
    const employeeId = employeeByLogin.get(record.login)!;
    if (await overlapsWebsiteSession(employeeId, record)) {
      errors.push({
        rowNumber: record.rowNumber,
        login: record.login,
        reason: `Overlaps a timecard session already recorded on the website for ${record.workDate}`,
      });
      continue;
    }

    const importRef = {
      source: TIMECARD_IMPORT_SOURCE,
      recordId: record.recordId,
      fileName: input.fileName.slice(0, 255),
    };
    const open = record.stoppedAt === null;
    const before = await WorkSession.findOneAndUpdate(
      { 'importRef.source': TIMECARD_IMPORT_SOURCE, 'importRef.recordId': record.recordId },
      {
        $set: {
          employeeId,
          workDate: record.workDate,
          startedAt: record.startedAt,
          stoppedAt: record.stoppedAt,
          durationMinutes: open
            ? null
            : Math.floor((record.stoppedAt!.getTime() - record.startedAt.getTime()) / 60_000),
          // Still "Working" in the source: never create a running session (it would
          // block starting today); the day stays incomplete for regularisation.
          status: open ? 'force_stopped' : 'completed',
          startMetadata: metadata,
          stopMetadata: open ? null : metadata,
          stoppedBy: null,
          importRef,
        },
      },
      { upsert: true, returnDocument: 'before', runValidators: true, setDefaultsOnInsert: true },
    ).exec();
    const session = await WorkSession.findOne({
      'importRef.source': TIMECARD_IMPORT_SOURCE,
      'importRef.recordId': record.recordId,
    })
      .select({ _id: 1 })
      .lean()
      .exec();
    if (before) sessionsUpdated += 1;
    else sessionsCreated += 1;
    if (open) openSessions += 1;
    if (
      before &&
      (String(before.employeeId) !== String(employeeId) || before.workDate !== record.workDate)
    ) {
      affectedDays.set(`${String(before.employeeId)}|${before.workDate}`, {
        employeeId: String(before.employeeId),
        workDate: before.workDate,
      });
    }

    await TimeEntry.deleteMany({
      'importRef.source': TIMECARD_IMPORT_SOURCE,
      'importRef.recordId': record.recordId,
    }).exec();
    const minutes = splitMinutes(record.workMinutes, record.projects.length);
    const entries = record.projects
      .map((project, index) => ({ project, durationMinutes: minutes[index]! }))
      .filter((entry) => entry.durationMinutes >= 1 && showIdByCode.has(entry.project.code))
      .map((entry) => ({
        employeeId,
        workDate: record.workDate,
        showId: showIdByCode.get(entry.project.code)!,
        workSessionId: session?._id ?? null,
        durationMinutes: entry.durationMinutes,
        comment: entry.project.comment,
        percentage: 100,
        importRef,
      }));
    if (entries.length > 0) {
      await TimeEntry.insertMany(entries);
      timesheetEntries += entries.length;
    } else if (record.projects.length > 0 && record.workMinutes === 0) {
      errors.push({
        rowNumber: record.rowNumber,
        login: record.login,
        reason: 'work_time is 0:00, so no timesheet entries were created',
      });
    }

    importedRecords += 1;
    affectedDays.set(`${String(employeeId)}|${record.workDate}`, {
      employeeId: String(employeeId),
      workDate: record.workDate,
    });
  }

  // Refresh attendance for every day the import touched.
  for (const day of affectedDays.values()) {
    try {
      await reconcileDailyTimecard(day.employeeId, day.workDate);
    } catch {
      // Reconciliation is retried by the daily job and on the next view.
    }
  }

  return {
    fileName: input.fileName,
    totalRecords: parsed.totalRecords,
    importedRecords,
    sessionsCreated,
    sessionsUpdated,
    openSessions,
    timesheetEntries,
    showsCreated,
    unmatchedLogins,
    errors: errors.sort((left, right) => left.rowNumber - right.rowNumber),
  };
}
