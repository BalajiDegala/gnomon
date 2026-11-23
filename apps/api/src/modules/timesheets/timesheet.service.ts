import type {
  CreateTimeEntryRequest,
  TimeEntryDto,
  TimesheetDayDto,
  TimesheetOption,
  UpdateTimeEntryRequest,
} from '@gnomon/shared';
import { getWorkDate } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Show } from '../shows/show.model.js';
import { WorkSession } from '../timecard/work-session.model.js';
import { TimeEntry, type TimeEntryDocument } from './time-entry.model.js';

let indexesReady: Promise<unknown> | null = null;

function ensureTimesheetIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([Show.createIndexes(), TimeEntry.createIndexes()]);
  return indexesReady;
}

export interface TimeEntryHours {
  workDate: string;
  durationMinutes: number;
}

function toTimeEntryDto(
  entry: TimeEntryDocument,
  show?: { code: string; name: string },
): TimeEntryDto {
  return {
    id: String(entry._id),
    workDate: entry.workDate,
    showId: String(entry.showId),
    showCode: show?.code ?? 'UNKNOWN',
    showName: show?.name ?? 'Unknown show',
    workSessionId: entry.workSessionId ? String(entry.workSessionId) : null,
    startedAt: entry.startedAt ? entry.startedAt.toISOString() : null,
    endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
    durationMinutes: entry.durationMinutes,
    comment: entry.comment,
    percentage: entry.percentage,
  };
}

export function validateTimeEntryHours(
  workDate: string,
  hours: number,
  now = new Date(),
): TimeEntryHours {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    throw new HttpError(400, 'Invalid work date', 'INVALID_WORK_DATE');
  }
  if (workDate > getWorkDate(now)) {
    throw new HttpError(400, 'Show time cannot be logged for a future date', 'FUTURE_TIME_ENTRY');
  }
  const durationMinutes = Math.round(hours * 60);
  if (!Number.isFinite(hours) || durationMinutes < 1) {
    throw new HttpError(400, 'Hours must be more than 0', 'INVALID_TIME_ENTRY_HOURS');
  }
  if (durationMinutes > 24 * 60) {
    throw new HttpError(400, 'A time entry cannot exceed 24 hours', 'TIME_ENTRY_TOO_LONG');
  }
  return { workDate, durationMinutes };
}

export async function getTimesheetOptions(): Promise<TimesheetOption[]> {
  await ensureTimesheetIndexes();
  const shows = await Show.find({ status: 'active' }).sort({ name: 1 }).lean().exec();
  return shows.map((show) => ({ id: String(show._id), code: show.code, name: show.name }));
}

export async function listTimeEntries(
  employeeId: string,
  from: string,
  to: string,
): Promise<TimeEntryDto[]> {
  await ensureTimesheetIndexes();
  const entries = await TimeEntry.find({ employeeId, workDate: { $gte: from, $lte: to } })
    .sort({ workDate: -1, createdAt: 1 })
    .lean()
    .exec();
  const shows = await Show.find({ _id: { $in: entries.map((entry) => entry.showId) } })
    .lean()
    .exec();
  const showById = new Map(shows.map((show) => [String(show._id), show]));
  return entries.map((entry) => toTimeEntryDto(entry, showById.get(String(entry.showId))));
}

async function buildTimesheetDay(employeeId: string, workDate: string): Promise<TimesheetDayDto> {
  const entries = await TimeEntry.find({ employeeId, workDate })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  const shows = await Show.find({ _id: { $in: entries.map((entry) => entry.showId) } })
    .lean()
    .exec();
  const showById = new Map(shows.map((show) => [String(show._id), show]));
  const entryDtos = entries.map((entry) =>
    toTimeEntryDto(entry, showById.get(String(entry.showId))),
  );

  return {
    workDate,
    entries: entryDtos,
    totalMinutes: entryDtos.reduce((total, entry) => total + entry.durationMinutes, 0),
    entryCount: entryDtos.length,
    averageProgress: entryDtos.length
      ? Math.round(
          entryDtos.reduce((total, entry) => total + entry.percentage, 0) / entryDtos.length,
        )
      : 0,
  };
}

export async function getTimesheetDay(
  employeeId: string,
  workDate = getWorkDate(new Date()),
): Promise<TimesheetDayDto> {
  await ensureTimesheetIndexes();
  return buildTimesheetDay(employeeId, workDate);
}

async function resolveEntryRelations(
  employeeId: string,
  showId: string,
  entryHours: TimeEntryHours,
  excludedEntryId?: string,
  allowedInactiveShowId?: string,
) {
  const showQuery =
    allowedInactiveShowId === showId
      ? Show.findById(showId)
      : Show.findOne({ _id: showId, status: 'active' });
  const [show, otherEntries, workSession] = await Promise.all([
    showQuery.lean().exec(),
    TimeEntry.find({
      employeeId,
      workDate: entryHours.workDate,
      ...(excludedEntryId ? { _id: { $ne: excludedEntryId } } : {}),
    })
      .select({ durationMinutes: 1 })
      .lean()
      .exec(),
    WorkSession.findOne({ employeeId, workDate: entryHours.workDate })
      .sort({ startedAt: 1 })
      .select({ _id: 1 })
      .lean()
      .exec(),
  ]);
  if (!show) throw new HttpError(404, 'Show not found or inactive', 'SHOW_NOT_FOUND');
  const loggedMinutes = otherEntries.reduce((total, entry) => total + entry.durationMinutes, 0);
  if (loggedMinutes + entryHours.durationMinutes > 24 * 60) {
    throw new HttpError(
      400,
      'Total show time for a day cannot exceed 24 hours',
      'TIME_ENTRY_DAY_LIMIT',
    );
  }
  return { show, workSession };
}

export async function createTimeEntry(
  employeeId: string,
  input: CreateTimeEntryRequest,
  now = new Date(),
): Promise<TimesheetDayDto> {
  await ensureTimesheetIndexes();
  const entryHours = validateTimeEntryHours(input.workDate, input.hours, now);
  const { show, workSession } = await resolveEntryRelations(employeeId, input.showId, entryHours);

  await TimeEntry.create({
    employeeId: new Types.ObjectId(employeeId),
    workDate: entryHours.workDate,
    showId: show._id,
    workSessionId: workSession?._id ?? null,
    startedAt: null,
    endedAt: null,
    durationMinutes: entryHours.durationMinutes,
    comment: input.comment,
    percentage: input.percentage,
  });

  return buildTimesheetDay(employeeId, entryHours.workDate);
}

export async function updateTimeEntry(
  employeeId: string,
  entryId: string,
  input: UpdateTimeEntryRequest,
  now = new Date(),
): Promise<TimesheetDayDto> {
  await ensureTimesheetIndexes();
  const entry = await TimeEntry.findOne({ _id: entryId, employeeId }).exec();
  if (!entry) throw new HttpError(404, 'Time entry not found', 'TIME_ENTRY_NOT_FOUND');

  const entryHours = validateTimeEntryHours(input.workDate, input.hours, now);
  if (entryHours.workDate !== entry.workDate) {
    throw new HttpError(400, 'An entry cannot be moved to another work date', 'WORK_DATE_CHANGE');
  }
  const { show, workSession } = await resolveEntryRelations(
    employeeId,
    input.showId,
    entryHours,
    entryId,
    String(entry.showId),
  );
  entry.showId = show._id;
  entry.workSessionId = workSession?._id ?? null;
  entry.startedAt = null;
  entry.endedAt = null;
  entry.durationMinutes = entryHours.durationMinutes;
  entry.comment = input.comment;
  entry.percentage = input.percentage;
  await entry.save();
  return buildTimesheetDay(employeeId, entry.workDate);
}

export async function deleteTimeEntry(
  employeeId: string,
  entryId: string,
): Promise<TimesheetDayDto> {
  const entry = await TimeEntry.findOneAndDelete({ _id: entryId, employeeId }).exec();
  if (!entry) throw new HttpError(404, 'Time entry not found', 'TIME_ENTRY_NOT_FOUND');
  return buildTimesheetDay(employeeId, entry.workDate);
}
