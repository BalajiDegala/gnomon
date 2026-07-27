import type {
  AuthUser,
  CreateTimeEntryRequest,
  TaskDto,
  TimeEntryDto,
  TimesheetDayDto,
  TimesheetDecisionActorRole,
  TimesheetDecisionRequest,
  TimesheetApprovalDto,
  TimesheetOption,
} from '@gnomon/shared';
import { getWorkDate } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import { Show, ShowAssignment, Task } from '../shows/show.model.js';
import { WorkSession } from '../timecard/work-session.model.js';
import { TimeEntry, type TimeEntryDocument } from './time-entry.model.js';

const APPROVAL_POLICY_VERSION = 'TIMESHEET_V1';

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

function employeeName(employee: Pick<EmployeeDocument, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function toTimeEntryDto(
  entry: TimeEntryDocument,
  show?: { code: string; name: string },
  task?: { code: string; name: string },
): TimeEntryDto {
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
    approval: {
      policyVersion: entry.approval?.policyVersion ?? APPROVAL_POLICY_VERSION,
      submittedAt: entry.approval?.submittedAt?.toISOString() ?? null,
      decisions: (entry.approval?.decisions ?? []).map((decision) => ({
        decision: decision.decision,
        actorDisplayName: decision.actorDisplayName,
        actorRole: decision.actorRole,
        comment: decision.comment,
        decidedAt: decision.decidedAt.toISOString(),
      })),
    },
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

  const entryDtos = entries.map((entry) =>
    toTimeEntryDto(entry, showById.get(String(entry.showId)), taskById.get(String(entry.taskId))),
  );

  return {
    workDate,
    entries: entryDtos,
    totalMinutes: entryDtos.reduce((total, entry) => total + entry.durationMinutes, 0),
    draftCount: entryDtos.filter((entry) => entry.status === 'draft').length,
    submittedCount: entryDtos.filter((entry) => entry.status === 'submitted').length,
    approvedCount: entryDtos.filter((entry) => entry.status === 'approved').length,
    rejectedCount: entryDtos.filter((entry) => entry.status === 'rejected').length,
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
      policyVersion: APPROVAL_POLICY_VERSION,
      currentStep: 0,
      assignedApproverIds: [],
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      decisions: [],
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
  now = new Date(),
): Promise<TimesheetDayDto> {
  const result = await TimeEntry.updateMany(
    { employeeId, workDate, status: 'draft' },
    {
      $set: {
        status: 'submitted',
        'approval.policyVersion': APPROVAL_POLICY_VERSION,
        'approval.currentStep': 1,
        'approval.submittedAt': now,
      },
    },
  ).exec();
  if (result.modifiedCount === 0) {
    throw new HttpError(409, 'There are no draft entries to submit', 'NO_DRAFT_ENTRIES');
  }
  return buildTimesheetDay(employeeId, workDate);
}

function hasCompanyOrShowGrant(
  user: AuthUser,
  roleCode: 'SHOW_MANAGER' | 'SYSTEM_ADMIN',
  showId: string,
): boolean {
  return user.grants.some(
    (grant) =>
      grant.roleCode === roleCode &&
      grant.permissions.includes('timesheet:approve') &&
      (grant.scope.type === 'company' ||
        (grant.scope.type === 'show' && grant.scope.ids.includes(showId))),
  );
}

export function canApproveTimeEntry(
  user: AuthUser,
  employee: Pick<EmployeeDocument, '_id' | 'reportingManagerId'>,
  showId: string,
): boolean {
  if (String(employee._id) === user.employeeId) return false;

  if (
    hasCompanyOrShowGrant(user, 'SYSTEM_ADMIN', showId) ||
    hasCompanyOrShowGrant(user, 'SHOW_MANAGER', showId)
  ) {
    return true;
  }

  if (String(employee.reportingManagerId) !== user.employeeId) return false;
  return user.grants.some(
    (grant) =>
      grant.roleCode === 'REPORTING_MANAGER' &&
      grant.permissions.includes('timesheet:approve') &&
      (grant.scope.type === 'company' ||
        (grant.scope.type === 'direct_reports' &&
          (grant.scope.ids.length === 0 || grant.scope.ids.includes(String(employee._id))))),
  );
}

function decisionActorRole(
  user: AuthUser,
  employee: Pick<EmployeeDocument, '_id' | 'reportingManagerId'>,
  showId: string,
): TimesheetDecisionActorRole {
  if (hasCompanyOrShowGrant(user, 'SYSTEM_ADMIN', showId)) return 'system_admin';
  if (hasCompanyOrShowGrant(user, 'SHOW_MANAGER', showId)) return 'show_manager';
  if (
    String(employee.reportingManagerId) === user.employeeId &&
    user.grants.some(
      (grant) =>
        grant.roleCode === 'REPORTING_MANAGER' && grant.permissions.includes('timesheet:approve'),
    )
  ) {
    return 'reporting_manager';
  }
  return 'show_manager';
}

function toApprovalDto(
  entry: TimeEntryDocument,
  employee: Pick<EmployeeDocument, '_id' | 'employeeCode' | 'firstName' | 'lastName'>,
  show?: { code: string; name: string },
  task?: { code: string; name: string },
): TimesheetApprovalDto {
  return {
    ...toTimeEntryDto(entry, show, task),
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    employeeDisplayName: employeeName(employee),
  };
}

export async function listTimesheetApprovals(user: AuthUser): Promise<TimesheetApprovalDto[]> {
  await ensureTimesheetIndexes();
  const entries = await TimeEntry.find({
    status: 'submitted',
    employeeId: { $ne: user.employeeId },
  })
    .sort({ 'approval.submittedAt': 1, workDate: 1, startedAt: 1 })
    .lean()
    .exec();
  if (entries.length === 0) return [];

  const [employees, shows, tasks] = await Promise.all([
    Employee.find({ _id: { $in: entries.map((entry) => entry.employeeId) } })
      .lean()
      .exec(),
    Show.find({ _id: { $in: entries.map((entry) => entry.showId) } })
      .lean()
      .exec(),
    Task.find({ _id: { $in: entries.map((entry) => entry.taskId) } })
      .lean()
      .exec(),
  ]);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const showById = new Map(shows.map((show) => [String(show._id), show]));
  const taskById = new Map(tasks.map((task) => [String(task._id), task]));

  return entries.flatMap((entry) => {
    const employee = employeeById.get(String(entry.employeeId));
    if (!employee || !canApproveTimeEntry(user, employee, String(entry.showId))) return [];
    return [
      toApprovalDto(
        entry,
        employee,
        showById.get(String(entry.showId)),
        taskById.get(String(entry.taskId)),
      ),
    ];
  });
}

export async function decideTimeEntry(
  user: AuthUser,
  entryId: string,
  input: TimesheetDecisionRequest,
  now = new Date(),
): Promise<TimesheetApprovalDto> {
  await ensureTimesheetIndexes();
  const entry = await TimeEntry.findOne({ _id: entryId, status: 'submitted' }).exec();
  if (!entry) throw new HttpError(404, 'Submitted time entry not found', 'TIME_ENTRY_NOT_FOUND');

  const [employee, show, task] = await Promise.all([
    Employee.findById(entry.employeeId).lean().exec(),
    Show.findById(entry.showId).lean().exec(),
    Task.findById(entry.taskId).lean().exec(),
  ]);
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  if (String(employee._id) === user.employeeId) {
    throw new HttpError(403, 'Self approval is not allowed', 'SELF_APPROVAL_FORBIDDEN');
  }
  if (!canApproveTimeEntry(user, employee, String(entry.showId))) {
    throw new HttpError(403, 'This entry is outside your approval scope', 'SCOPE_FORBIDDEN');
  }

  const approved = input.decision === 'approved';
  const updated = await TimeEntry.findOneAndUpdate(
    { _id: entry._id, status: 'submitted' },
    {
      $set: {
        status: input.decision,
        'approval.currentStep': 2,
        'approval.approvedBy': approved ? new Types.ObjectId(user.id) : null,
        'approval.approvedAt': approved ? now : null,
        'approval.rejectionReason': approved ? null : input.comment,
      },
      $push: {
        'approval.decisions': {
          decision: input.decision,
          actorUserId: new Types.ObjectId(user.id),
          actorEmployeeId: new Types.ObjectId(user.employeeId),
          actorDisplayName: user.displayName,
          actorRole: decisionActorRole(user, employee, String(entry.showId)),
          comment: input.comment,
          decidedAt: now,
        },
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!updated) {
    throw new HttpError(409, 'The entry was already decided', 'TIME_ENTRY_ALREADY_DECIDED');
  }

  return toApprovalDto(updated, employee, show ?? undefined, task ?? undefined);
}
