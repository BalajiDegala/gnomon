import type {
  AssignShowEmployeeRequest,
  AuthUser,
  CreateShowRequest,
  CreateTaskRequest,
  ShowAdminDto,
  TaskDto,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { Show, ShowAssignment, Task } from './show.model.js';

let indexesReady: Promise<unknown> | null = null;

function ensureShowIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([
    Show.createIndexes(),
    Task.createIndexes(),
    ShowAssignment.createIndexes(),
  ]);
  return indexesReady;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function hasCompanyShowManagement(user: AuthUser): boolean {
  return user.grants.some(
    (grant) => grant.permissions.includes('show:manage') && grant.scope.type === 'company',
  );
}

function manageableShowIds(user: AuthUser): string[] {
  return user.grants
    .filter((grant) => grant.permissions.includes('show:manage') && grant.scope.type === 'show')
    .flatMap((grant) => grant.scope.ids);
}

function assertCanManageShow(user: AuthUser, showId: string): void {
  if (hasCompanyShowManagement(user) || manageableShowIds(user).includes(showId)) return;
  throw new HttpError(403, 'This show is outside your assigned scope', 'SCOPE_FORBIDDEN');
}

async function buildAdminDtos(showIds?: Types.ObjectId[]): Promise<ShowAdminDto[]> {
  const showFilter = showIds ? { _id: { $in: showIds } } : {};
  const shows = await Show.find(showFilter).sort({ status: 1, name: 1 }).lean().exec();
  if (shows.length === 0) return [];

  const ids = shows.map((show) => show._id);
  const [tasks, assignments] = await Promise.all([
    Task.find({ showId: { $in: ids } })
      .sort({ status: 1, name: 1 })
      .lean()
      .exec(),
    ShowAssignment.find({ showId: { $in: ids } })
      .sort({ status: 1, createdAt: 1 })
      .lean()
      .exec(),
  ]);
  const employees = await Employee.find({
    _id: { $in: assignments.map((assignment) => assignment.employeeId) },
  })
    .select({ employeeCode: 1, firstName: 1, lastName: 1 })
    .lean()
    .exec();
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));

  return shows.map((show) => ({
    id: String(show._id),
    code: show.code,
    name: show.name,
    status: show.status,
    tasks: tasks
      .filter((task) => task.showId.equals(show._id))
      .map<TaskDto>((task) => ({
        id: String(task._id),
        showId: String(task.showId),
        code: task.code,
        name: task.name,
        status: task.status,
      })),
    assignments: assignments
      .filter((assignment) => assignment.showId.equals(show._id))
      .map((assignment) => {
        const employee = employeeById.get(String(assignment.employeeId));
        return {
          id: String(assignment._id),
          employeeId: String(assignment.employeeId),
          employeeCode: employee?.employeeCode ?? 'UNKNOWN',
          displayName: employee
            ? `${employee.firstName} ${employee.lastName}`.trim()
            : 'Unknown employee',
          status: assignment.status,
        };
      }),
  }));
}

export async function listManageableShows(user: AuthUser): Promise<ShowAdminDto[]> {
  await ensureShowIndexes();
  if (hasCompanyShowManagement(user)) return buildAdminDtos();
  return buildAdminDtos(
    manageableShowIds(user)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id)),
  );
}

export async function createShow(user: AuthUser, input: CreateShowRequest): Promise<ShowAdminDto> {
  await ensureShowIndexes();
  if (!hasCompanyShowManagement(user)) {
    throw new HttpError(403, 'Creating shows requires company scope', 'SCOPE_FORBIDDEN');
  }

  try {
    const show = await Show.create({ ...input, status: 'active', createdBy: user.id });
    return (await buildAdminDtos([show._id]))[0]!;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'A show with this code already exists', 'SHOW_CODE_EXISTS');
    }
    throw error;
  }
}

export async function createShowTask(
  user: AuthUser,
  showId: string,
  input: CreateTaskRequest,
): Promise<ShowAdminDto> {
  await ensureShowIndexes();
  assertCanManageShow(user, showId);
  const show = await Show.findById(showId).lean().exec();
  if (!show) throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');

  try {
    await Task.create({
      showId: show._id,
      ...input,
      status: 'active',
      createdBy: user.id,
    });
    return (await buildAdminDtos([show._id]))[0]!;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'This task code already exists for the show', 'TASK_CODE_EXISTS');
    }
    throw error;
  }
}

export async function assignEmployeeToShow(
  user: AuthUser,
  showId: string,
  input: AssignShowEmployeeRequest,
): Promise<ShowAdminDto> {
  await ensureShowIndexes();
  assertCanManageShow(user, showId);
  const [show, employee] = await Promise.all([
    Show.findById(showId).lean().exec(),
    Employee.findOne({ employeeCode: input.employeeCode, status: 'active' }).lean().exec(),
  ]);
  if (!show) throw new HttpError(404, 'Show not found', 'SHOW_NOT_FOUND');
  if (!employee) {
    throw new HttpError(404, 'No active employee matches this code', 'EMPLOYEE_NOT_FOUND');
  }

  await ShowAssignment.findOneAndUpdate(
    { showId: show._id, employeeId: employee._id },
    {
      $set: { status: 'active', activeUntil: null, assignedBy: new Types.ObjectId(user.id) },
      $setOnInsert: { activeFrom: new Date() },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).exec();

  return (await buildAdminDtos([show._id]))[0]!;
}
