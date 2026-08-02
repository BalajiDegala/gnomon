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

export interface TimeEntryWindow {
  startedAt: Date;
  endedAt: Date;
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
    startedAt: entry.startedAt.toISOString(),
    endedAt: entry.endedAt.toISOString(),
    durationMinutes: entry.durationMinutes,
    comment: entry.comment,
    percentage: entry.percentage,
  };
}

export function validateTimeEntryWindow(
  startedAtValue: string,
  endedAtValue: string,
  now = new Date(),
): TimeEntryWindow {
  const startedAt = new Date(startedAtValue);
  const endedAt = new Date(endedAtValue);
  const elapsedMilliseconds = endedAt.getTime() - startedAt.getTime();

  if (
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(endedAt.getTime()) ||
    elapsedMilliseconds <= 0
  ) {
    throw new HttpError(400, 'End time must be after start time', 'INVALID_TIME_ENTRY_WINDOW');
  }
  if (elapsedMilliseconds > 24 * 60 * 60_000) {
    throw new HttpError(400, 'A time entry cannot exceed 24 hours', 'TIME_ENTRY_TOO_LONG');
  }
  if (endedAt.getTime() > now.getTime() + 5 * 60_000) {
    throw new HttpError(400, 'Show time cannot end in the future', 'FUTURE_TIME_ENTRY');
  }

  const workDate = getWorkDate(startedAt);
  const endWorkDate = getWorkDate(new Date(endedAt.getTime() - 1));
  if (endWorkDate !== workDate) {
    throw new HttpError(
      400,
      'A time entry must stay inside one 07:00-to-07:00 workday',
      'TIME_ENTRY_CROSSES_WORKDAY',
    );
  }

  return {
    startedAt,
    endedAt,
    workDate,
    durationMinutes: Math.max(1, Math.round(elapsedMilliseconds / 60_000)),
  };
}

export async function getTimesheetOptions(): Promise<TimesheetOption[]> {
  await ensureTimesheetIndexes();
  const shows = await Show.find({ status: 'active' }).sort({ name: 1 }).lean().exec();
  return shows.map((show) => ({ id: String(show._id), code: show.code, name: show.name }));
}

async function buildTimesheetDay(employeeId: string, workDate: string): Promise<TimesheetDayDto> {
  const entries = await TimeEntry.find({ employeeId, workDate })
    .sort({ startedAt: 1 })
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
  window: TimeEntryWindow,
  excludedEntryId?: string,
  allowedInactiveShowId?: string,
) {
  const showQuery =
    allowedInactiveShowId === showId
      ? Show.findById(showId)
      : Show.findOne({ _id: showId, status: 'active' });
  const [show, overlap, workSession] = await Promise.all([
    showQuery.lean().exec(),
    TimeEntry.exists({
      employeeId,
      ...(excludedEntryId ? { _id: { $ne: excludedEntryId } } : {}),
      startedAt: { $lt: window.endedAt },
      endedAt: { $gt: window.startedAt },
    }),
    WorkSession.findOne({
      employeeId,
      startedAt: { $lte: window.startedAt },
      $or: [{ stoppedAt: { $gte: window.endedAt } }, { status: 'running', stoppedAt: null }],
    })
      .select({ _id: 1 })
      .lean()
      .exec(),
  ]);
  if (!show) throw new HttpError(404, 'Show not found or inactive', 'SHOW_NOT_FOUND');
  if (overlap) {
    throw new HttpError(409, 'This show time overlaps another entry', 'TIME_ENTRY_OVERLAP');
  }
  return { show, workSession };
}

export async function createTimeEntry(
  employeeId: string,
  input: CreateTimeEntryRequest,
  now = new Date(),
): Promise<TimesheetDayDto> {
  await ensureTimesheetIndexes();
  const window = validateTimeEntryWindow(input.startedAt, input.endedAt, now);
  const { show, workSession } = await resolveEntryRelations(employeeId, input.showId, window);

  await TimeEntry.create({
    employeeId: new Types.ObjectId(employeeId),
    workDate: window.workDate,
    showId: show._id,
    workSessionId: workSession?._id ?? null,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    durationMinutes: window.durationMinutes,
    comment: input.comment,
    percentage: input.percentage,
  });

  return buildTimesheetDay(employeeId, window.workDate);
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

  const window = validateTimeEntryWindow(input.startedAt, input.endedAt, now);
  if (window.workDate !== entry.workDate) {
    throw new HttpError(400, 'An entry cannot be moved to another work date', 'WORK_DATE_CHANGE');
  }
  const { show, workSession } = await resolveEntryRelations(
    employeeId,
    input.showId,
    window,
    entryId,
    String(entry.showId),
  );
  entry.showId = show._id;
  entry.workSessionId = workSession?._id ?? null;
  entry.startedAt = window.startedAt;
  entry.endedAt = window.endedAt;
  entry.durationMinutes = window.durationMinutes;
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
