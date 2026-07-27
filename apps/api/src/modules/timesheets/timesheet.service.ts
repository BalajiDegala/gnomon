import type {
  CreateTimeEntryRequest,
  TaskDto,
  TimeEntryDto,
  TimesheetDayDto,
  TimesheetOption,
} from '@gnomon/shared';
import { getWorkDate } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Show, ShowAssignment, Task } from '../shows/show.model.js';
import { WorkSession } from '../timecard/work-session.model.js';
import { TimeEntry } from './time-entry.model.js';

let indexesReady: Promise<unknown> | null = null;

function ensureTimesheetIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([
    Show.createIndexes(),
    Task.createIndexes(),
    ShowAssignment.createIndexes(),
    TimeEntry.createIndexes(),
  ]);
  return indexesReady;
}

export interface TimeEntryWindow {
  startedAt: Date;
  endedAt: Date;
  workDate: string;
  durationMinutes: number;
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
    throw new HttpError(400, 'A task entry cannot exceed 24 hours', 'TIME_ENTRY_TOO_LONG');
  }
  if (endedAt.getTime() > now.getTime() + 5 * 60_000) {
    throw new HttpError(400, 'Task time cannot end in the future', 'FUTURE_TIME_ENTRY');
  }

  const workDate = getWorkDate(startedAt);
  const endWorkDate = getWorkDate(new Date(endedAt.getTime() - 1));
  if (endWorkDate !== workDate) {
    throw new HttpError(
      400,
      'A task entry must stay inside one 07:00-to-07:00 workday',
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

export async function getTimesheetOptions(employeeId: string): Promise<TimesheetOption[]> {
  await ensureTimesheetIndexes();
  const now = new Date();
  const assignments = await ShowAssignment.find({
    employeeId,
    status: 'active',
    activeFrom: { $lte: now },
    $or: [{ activeUntil: null }, { activeUntil: { $gt: now } }],
  })
    .lean()
    .exec();
  if (assignments.length === 0) return [];

  const showIds = assignments.map((assignment) => assignment.showId);
  const [shows, tasks] = await Promise.all([
    Show.find({ _id: { $in: showIds }, status: 'active' })
      .sort({ name: 1 })
      .lean()
      .exec(),
    Task.find({ showId: { $in: showIds }, status: 'active' })
      .sort({ name: 1 })
      .lean()
      .exec(),
  ]);

  return shows.map((show) => ({
    id: String(show._id),
    code: show.code,
    name: show.name,
    tasks: tasks
      .filter((task) => task.showId.equals(show._id))
      .map<TaskDto>((task) => ({
        id: String(task._id),
        showId: String(task.showId),
        code: task.code,
        name: task.name,
        status: task.status,
      })),
  }));
}

async function buildTimesheetDay(employeeId: string, workDate: string): Promise<TimesheetDayDto> {
  const entries = await TimeEntry.find({ employeeId, workDate })
    .sort({ startedAt: 1 })
    .lean()
    .exec();
  const [shows, tasks] = await Promise.all([
    Show.find({ _id: { $in: entries.map((entry) => entry.showId) } })
      .lean()
      .exec(),
    Task.find({ _id: { $in: entries.map((entry) => entry.taskId) } })
      .lean()
      .exec(),
  ]);
  const showById = new Map(shows.map((show) => [String(show._id), show]));
  const taskById = new Map(tasks.map((task) => [String(task._id), task]));

  const entryDtos = entries.map<TimeEntryDto>((entry) => {
    const show = showById.get(String(entry.showId));
    const task = taskById.get(String(entry.taskId));
    return {
      id: String(entry._id),
      workDate: entry.workDate,
      showId: String(entry.showId),
      showCode: show?.code ?? 'UNKNOWN',
      showName: show?.name ?? 'Unknown show',
      taskId: String(entry.taskId),
      taskCode: task?.code ?? 'UNKNOWN',
      taskName: task?.name ?? 'Unknown task',
      workSessionId: entry.workSessionId ? String(entry.workSessionId) : null,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt.toISOString(),
      durationMinutes: entry.durationMinutes,
      description: entry.description,
      billable: entry.billable,
      status: entry.status,
    };
  });

  return {
    workDate,
    entries: entryDtos,
    totalMinutes: entryDtos.reduce((total, entry) => total + entry.durationMinutes, 0),
    draftCount: entryDtos.filter((entry) => entry.status === 'draft').length,
    submittedCount: entryDtos.filter((entry) => entry.status === 'submitted').length,
  };
}

export async function getTimesheetDay(
  employeeId: string,
  workDate = getWorkDate(new Date()),
): Promise<TimesheetDayDto> {
  await ensureTimesheetIndexes();
  return buildTimesheetDay(employeeId, workDate);
}

export async function createTimeEntry(
  employeeId: string,
  input: CreateTimeEntryRequest,
  now = new Date(),
): Promise<TimesheetDayDto> {
  await ensureTimesheetIndexes();
  const window = validateTimeEntryWindow(input.startedAt, input.endedAt, now);
  const [show, task, assignment] = await Promise.all([
    Show.findOne({ _id: input.showId, status: 'active' }).lean().exec(),
    Task.findOne({ _id: input.taskId, showId: input.showId, status: 'active' }).lean().exec(),
    ShowAssignment.findOne({
      showId: input.showId,
      employeeId,
      status: 'active',
      activeFrom: { $lte: now },
      $or: [{ activeUntil: null }, { activeUntil: { $gt: now } }],
    })
      .lean()
      .exec(),
  ]);

  if (!show) throw new HttpError(404, 'Show not found or inactive', 'SHOW_NOT_FOUND');
  if (!task) throw new HttpError(404, 'Task not found for this show', 'TASK_NOT_FOUND');
  if (!assignment) {
    throw new HttpError(403, 'You are not assigned to this show', 'SHOW_ASSIGNMENT_REQUIRED');
  }

  const overlap = await TimeEntry.exists({
    employeeId,
    status: { $ne: 'rejected' },
    startedAt: { $lt: window.endedAt },
    endedAt: { $gt: window.startedAt },
  });
  if (overlap) {
    throw new HttpError(409, 'This task time overlaps another entry', 'TIME_ENTRY_OVERLAP');
  }

  const workSession = await WorkSession.findOne({
    employeeId,
    startedAt: { $lte: window.startedAt },
    $or: [{ stoppedAt: { $gte: window.endedAt } }, { status: 'running', stoppedAt: null }],
  })
    .select({ _id: 1 })
    .lean()
    .exec();

  await TimeEntry.create({
    employeeId: new Types.ObjectId(employeeId),
    workDate: window.workDate,
    showId: show._id,
    projectId: null,
    taskId: task._id,
    workSessionId: workSession?._id ?? null,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    durationMinutes: window.durationMinutes,
    description: input.description,
    billable: input.billable,
    status: 'draft',
    approval: {
      policyId: null,
      currentStep: 0,
      assignedApproverIds: [],
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
    },
  });

  return buildTimesheetDay(employeeId, window.workDate);
}

export async function deleteDraftTimeEntry(
  employeeId: string,
  entryId: string,
): Promise<TimesheetDayDto> {
  const entry = await TimeEntry.findOneAndDelete({
    _id: entryId,
    employeeId,
    status: 'draft',
  }).exec();
  if (!entry) {
    throw new HttpError(404, 'Draft time entry not found', 'TIME_ENTRY_NOT_FOUND');
  }
  return buildTimesheetDay(employeeId, entry.workDate);
}

export async function submitTimesheetDay(
  employeeId: string,
  workDate: string,
): Promise<TimesheetDayDto> {
  const result = await TimeEntry.updateMany(
    { employeeId, workDate, status: 'draft' },
    { $set: { status: 'submitted', 'approval.currentStep': 1 } },
  ).exec();
  if (result.modifiedCount === 0) {
    throw new HttpError(409, 'There are no draft entries to submit', 'NO_DRAFT_ENTRIES');
  }
  return buildTimesheetDay(employeeId, workDate);
}
