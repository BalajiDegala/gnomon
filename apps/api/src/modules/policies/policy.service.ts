import {
  getWorkDate,
  type AuthUser,
  type EmployeeLeaveBalanceAdministrationDto,
  type HolidayDto,
  type UpsertHolidayRequest,
  type UpdateLeaveBalanceRequest,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import { LeaveBalance, LeaveRequest } from '../leaves/leave.model.js';
import { DailyTimecard } from '../reconciliation/daily-timecard.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { Holiday, type HolidayDocument } from './holiday.model.js';

const paidLeaveTypes = ['casual', 'sick', 'earned'] as const;
let indexesReady: Promise<unknown> | null = null;

function ensureIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([Holiday.createIndexes(), LeaveBalance.createIndexes()]);
  return indexesReady;
}

function toHolidayDto(holiday: HolidayDocument): HolidayDto {
  return {
    id: String(holiday._id),
    date: holiday.date,
    name: holiday.name,
    scopeType: holiday.scopeType,
    locationId: holiday.locationId ? String(holiday.locationId) : null,
    status: holiday.status,
    createdAt: holiday.createdAt.toISOString(),
    updatedAt: holiday.updatedAt.toISOString(),
  };
}

export function canManageHoliday(
  user: AuthUser,
  input: Pick<HolidayDocument, 'scopeType' | 'locationId'>,
) {
  return user.grants.some((grant) => {
    if (!grant.permissions.includes('policy:manage')) return false;
    if (grant.scope.type === 'company') return true;
    return (
      input.scopeType === 'location' &&
      grant.scope.type === 'location' &&
      input.locationId !== null &&
      grant.scope.ids.includes(String(input.locationId))
    );
  });
}

export function canManageEmployeeBalance(user: AuthUser, employee: EmployeeDocument): boolean {
  return user.grants.some((grant) => {
    if (
      !['HR', 'SYSTEM_ADMIN'].includes(grant.roleCode) ||
      !grant.permissions.includes('employee:update')
    ) {
      return false;
    }
    if (grant.scope.type === 'company') return true;
    if (grant.scope.type === 'department') {
      return Boolean(
        employee.departmentId && grant.scope.ids.includes(String(employee.departmentId)),
      );
    }
    if (grant.scope.type === 'location') {
      return Boolean(employee.locationId && grant.scope.ids.includes(String(employee.locationId)));
    }
    return false;
  });
}

export async function listApplicableHolidays(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<HolidayDto[]> {
  const employee = await Employee.findById(employeeId).select({ locationId: 1 }).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  const scopes: Array<Record<string, unknown>> = [{ scopeType: 'company', locationId: null }];
  if (employee.locationId) {
    scopes.push({ scopeType: 'location', locationId: employee.locationId });
  }
  const holidays = await Holiday.find({
    status: 'active',
    date: { $gte: startDate, $lte: endDate },
    $or: scopes,
  })
    .sort({ date: 1, name: 1 })
    .lean()
    .exec();
  return holidays.map(toHolidayDto);
}

export async function listAdminHolidays(user: AuthUser, year: number): Promise<HolidayDto[]> {
  await ensureIndexes();
  const filters = user.grants.flatMap((grant) => {
    if (!grant.permissions.includes('policy:manage')) return [];
    if (grant.scope.type === 'company') return [{}];
    if (grant.scope.type === 'location') {
      return grant.scope.ids.map((id) => ({ scopeType: 'location', locationId: id }));
    }
    return [];
  });
  if (filters.length === 0) return [];
  const query = filters.some((filter) => Object.keys(filter).length === 0)
    ? { date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }
    : { date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` }, $or: filters };
  const holidays = await Holiday.find(query).sort({ date: 1, name: 1 }).lean().exec();
  return holidays.map(toHolidayDto);
}

async function assertNoReservedLeaveConflict(input: UpsertHolidayRequest): Promise<void> {
  let employeeIds: Types.ObjectId[] | undefined;
  if (input.scopeType === 'location' && input.locationId) {
    employeeIds = await Employee.find({ locationId: input.locationId }).distinct('_id').exec();
  }
  const conflict = await LeaveRequest.exists({
    reservationActive: true,
    reservedDates: input.date,
    ...(employeeIds ? { employeeId: { $in: employeeIds } } : {}),
  });
  if (conflict) {
    throw new HttpError(
      409,
      'An active leave request already reserves this date; resolve it before adding the holiday',
      'HOLIDAY_LEAVE_CONFLICT',
    );
  }
}

async function assertNoLeaveRangeConflict(holiday: HolidayDocument): Promise<void> {
  let employeeIds: Types.ObjectId[] | undefined;
  if (holiday.scopeType === 'location' && holiday.locationId) {
    employeeIds = await Employee.find({ locationId: holiday.locationId }).distinct('_id').exec();
  }
  const conflict = await LeaveRequest.exists({
    reservationActive: true,
    startDate: { $lte: holiday.date },
    endDate: { $gte: holiday.date },
    ...(employeeIds ? { employeeId: { $in: employeeIds } } : {}),
  });
  if (conflict) {
    throw new HttpError(
      409,
      'An active leave range covers this date; resolve it before archiving the holiday',
      'HOLIDAY_LEAVE_CONFLICT',
    );
  }
}

async function reconcileExistingTimecards(workDate: string, now: Date): Promise<void> {
  if (workDate > getWorkDate(now)) return;
  const employeeIds = await DailyTimecard.find({ workDate }).distinct('employeeId').exec();
  await Promise.all(
    employeeIds.map((employeeId) => reconcileDailyTimecard(String(employeeId), workDate, now)),
  );
}

export async function upsertHoliday(
  user: AuthUser,
  input: UpsertHolidayRequest,
  now = new Date(),
): Promise<HolidayDto> {
  await ensureIndexes();
  const locationId = input.locationId ? new Types.ObjectId(input.locationId) : null;
  if (!canManageHoliday(user, { scopeType: input.scopeType, locationId })) {
    throw new HttpError(403, 'This holiday is outside your policy scope', 'SCOPE_FORBIDDEN');
  }
  const existing = await Holiday.findOne({
    date: input.date,
    scopeType: input.scopeType,
    locationId,
  }).exec();
  if (!existing || existing.status === 'archived') await assertNoReservedLeaveConflict(input);

  const holiday = await Holiday.findOneAndUpdate(
    { date: input.date, scopeType: input.scopeType, locationId },
    {
      $set: {
        name: input.name,
        status: 'active',
        updatedByUserId: new Types.ObjectId(user.id),
      },
      $setOnInsert: { createdByUserId: new Types.ObjectId(user.id) },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  await reconcileExistingTimecards(input.date, now);
  return toHolidayDto(holiday!);
}

export async function archiveHoliday(
  user: AuthUser,
  holidayId: string,
  now = new Date(),
): Promise<HolidayDto> {
  const holiday = await Holiday.findById(holidayId).exec();
  if (!holiday) throw new HttpError(404, 'Holiday not found', 'HOLIDAY_NOT_FOUND');
  if (!canManageHoliday(user, holiday)) {
    throw new HttpError(403, 'This holiday is outside your policy scope', 'SCOPE_FORBIDDEN');
  }
  await assertNoLeaveRangeConflict(holiday);
  holiday.status = 'archived';
  holiday.updatedByUserId = new Types.ObjectId(user.id);
  await holiday.save();
  await reconcileExistingTimecards(holiday.date, now);
  return toHolidayDto(holiday);
}

async function employeeForBalance(user: AuthUser, employeeCode: string) {
  const employee = await Employee.findOne({ employeeCode, status: 'active' }).lean().exec();
  if (!employee) throw new HttpError(404, 'Active employee not found', 'EMPLOYEE_NOT_FOUND');
  if (!canManageEmployeeBalance(user, employee)) {
    throw new HttpError(403, 'This employee is outside your assigned scope', 'SCOPE_FORBIDDEN');
  }
  return employee;
}

export async function getEmployeeLeaveBalances(
  user: AuthUser,
  employeeCode: string,
  year: number,
): Promise<EmployeeLeaveBalanceAdministrationDto> {
  await ensureIndexes();
  const employee = await employeeForBalance(user, employeeCode);
  const [configured, requests] = await Promise.all([
    LeaveBalance.find({ employeeId: employee._id, year }).lean().exec(),
    LeaveRequest.find({
      employeeId: employee._id,
      startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
      status: { $in: ['pending_manager', 'approved'] },
    })
      .select({ leaveType: 1, requestedDays: 1, status: 1 })
      .lean()
      .exec(),
  ]);
  const configuredByType = new Map(configured.map((balance) => [balance.leaveType, balance]));
  return {
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    employeeDisplayName: `${employee.firstName} ${employee.lastName}`.trim(),
    year,
    balances: paidLeaveTypes.map((leaveType) => {
      const balance = configuredByType.get(leaveType);
      const pendingDays = requests
        .filter(
          (request) => request.leaveType === leaveType && request.status === 'pending_manager',
        )
        .reduce((total, request) => total + request.requestedDays, 0);
      const approvedDays = requests
        .filter((request) => request.leaveType === leaveType && request.status === 'approved')
        .reduce((total, request) => total + request.requestedDays, 0);
      const entitledDays = balance?.entitledDays ?? 0;
      const adjustedDays = balance?.adjustedDays ?? 0;
      return {
        leaveType,
        year,
        entitledDays,
        adjustedDays,
        pendingDays,
        approvedDays,
        availableDays: entitledDays + adjustedDays - pendingDays - approvedDays,
        note: balance?.note ?? '',
        configured: Boolean(balance),
      };
    }),
  };
}

export async function updateEmployeeLeaveBalance(
  user: AuthUser,
  employeeCode: string,
  input: UpdateLeaveBalanceRequest,
): Promise<EmployeeLeaveBalanceAdministrationDto> {
  const employee = await employeeForBalance(user, employeeCode);
  const used = await LeaveRequest.aggregate<{ total: number }>([
    {
      $match: {
        employeeId: employee._id,
        leaveType: input.leaveType,
        startDate: { $gte: `${input.year}-01-01`, $lte: `${input.year}-12-31` },
        status: { $in: ['pending_manager', 'approved'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$requestedDays' } } },
  ]).exec();
  if (input.entitledDays + input.adjustedDays < (used[0]?.total ?? 0)) {
    throw new HttpError(
      409,
      'The configured balance cannot be lower than pending and approved leave',
      'BALANCE_BELOW_USAGE',
    );
  }
  await LeaveBalance.findOneAndUpdate(
    { employeeId: employee._id, leaveType: input.leaveType, year: input.year },
    {
      $set: {
        entitledDays: input.entitledDays,
        adjustedDays: input.adjustedDays,
        note: input.note,
        updatedByUserId: new Types.ObjectId(user.id),
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  return getEmployeeLeaveBalances(user, employee.employeeCode, input.year);
}
