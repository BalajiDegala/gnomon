import {
  getWorkDate,
  type AuthUser,
  type CreateLocationRequest,
  type EmployeeLeaveBalanceAdministrationDto,
  type EmployeeLocationAdministrationDto,
  type HolidayDto,
  type LocationDirectoryDto,
  type UpsertHolidayRequest,
  type UpdateEmployeeLocationRequest,
  type UpdateLeaveBalanceRequest,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import {
  EmployeeLocationAssignment,
  Location,
  type LocationDocument,
} from '../employees/location.model.js';
import { LeaveBalance, LeaveRequest } from '../leaves/leave.model.js';
import { DailyTimecard } from '../reconciliation/daily-timecard.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { listEmployeeIdsAtLocation } from './holiday-applicability.service.js';
import { Holiday, type HolidayDocument } from './holiday.model.js';

const paidLeaveTypes = ['casual', 'sick', 'earned'] as const;
let indexesReady: Promise<unknown> | null = null;

function ensureIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([
    Holiday.createIndexes(),
    LeaveBalance.createIndexes(),
    Location.createIndexes(),
    EmployeeLocationAssignment.createIndexes(),
  ]);
  return indexesReady;
}

function toHolidayDto(
  holiday: HolidayDocument,
  location?: Pick<LocationDocument, 'code' | 'name'>,
): HolidayDto {
  return {
    id: String(holiday._id),
    date: holiday.date,
    name: holiday.name,
    scopeType: holiday.scopeType,
    locationId: holiday.locationId ? String(holiday.locationId) : null,
    locationCode: location?.code ?? null,
    locationName: location?.name ?? null,
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
  const locations = await Location.find({
    _id: { $in: holidays.flatMap((holiday) => (holiday.locationId ? [holiday.locationId] : [])) },
  })
    .select({ code: 1, name: 1 })
    .lean()
    .exec();
  const locationById = new Map(locations.map((location) => [String(location._id), location]));
  return holidays.map((holiday) =>
    toHolidayDto(
      holiday,
      holiday.locationId ? locationById.get(String(holiday.locationId)) : undefined,
    ),
  );
}

async function assertNoReservedLeaveConflict(input: UpsertHolidayRequest): Promise<void> {
  let employeeIds: Types.ObjectId[] | undefined;
  if (input.scopeType === 'location' && input.locationId) {
    employeeIds = await listEmployeeIdsAtLocation(new Types.ObjectId(input.locationId), input.date);
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
    employeeIds = await listEmployeeIdsAtLocation(holiday.locationId, holiday.date);
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
  const location = locationId
    ? await Location.findOne({ _id: locationId, status: 'active' }).lean().exec()
    : null;
  if (locationId && !location) {
    throw new HttpError(404, 'Active location not found', 'LOCATION_NOT_FOUND');
  }
  if (!canManageHoliday(user, { scopeType: input.scopeType, locationId })) {
    throw new HttpError(403, 'This holiday is outside your policy scope', 'SCOPE_FORBIDDEN');
  }
  const overlappingScope = await Holiday.exists({
    date: input.date,
    status: 'active',
    scopeType: input.scopeType === 'company' ? 'location' : 'company',
  });
  if (overlappingScope) {
    throw new HttpError(
      409,
      'A company and location holiday cannot overlap on the same date',
      'HOLIDAY_SCOPE_OVERLAP',
    );
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
  return toHolidayDto(holiday!, location ?? undefined);
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
  const location = holiday.locationId
    ? await Location.findById(holiday.locationId).select({ code: 1, name: 1 }).lean().exec()
    : null;
  return toHolidayDto(holiday, location ?? undefined);
}

function hasCompanyGrant(user: AuthUser, permission: 'policy:manage' | 'employee:update') {
  return user.grants.some(
    (grant) => grant.permissions.includes(permission) && grant.scope.type === 'company',
  );
}

function scopedLocationIds(
  user: AuthUser,
  permissions: Array<'policy:manage' | 'employee:update'>,
): string[] {
  return [
    ...new Set(
      user.grants
        .filter(
          (grant) =>
            grant.scope.type === 'location' &&
            permissions.some((permission) => grant.permissions.includes(permission)),
        )
        .flatMap((grant) => grant.scope.ids),
    ),
  ];
}

export function canAssignEmployeeLocation(
  user: AuthUser,
  employee: Pick<EmployeeDocument, 'locationId'>,
  targetLocationId: Types.ObjectId | null,
): boolean {
  const grants = user.grants.filter(
    (grant) =>
      ['HR', 'SYSTEM_ADMIN'].includes(grant.roleCode) &&
      grant.permissions.includes('employee:update'),
  );
  if (grants.some((grant) => grant.scope.type === 'company')) return true;
  if (!employee.locationId || !targetLocationId) return false;
  return grants.some(
    (grant) =>
      grant.scope.type === 'location' &&
      grant.scope.ids.includes(String(employee.locationId)) &&
      grant.scope.ids.includes(String(targetLocationId)),
  );
}

function canAssignAtLocation(user: AuthUser, locationId: Types.ObjectId): boolean {
  return user.grants.some(
    (grant) =>
      ['HR', 'SYSTEM_ADMIN'].includes(grant.roleCode) &&
      grant.permissions.includes('employee:update') &&
      (grant.scope.type === 'company' ||
        (grant.scope.type === 'location' && grant.scope.ids.includes(String(locationId)))),
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function listAdminLocations(user: AuthUser): Promise<LocationDirectoryDto> {
  await ensureIndexes();
  const canReadAll =
    hasCompanyGrant(user, 'policy:manage') || hasCompanyGrant(user, 'employee:update');
  const locationIds = scopedLocationIds(user, ['policy:manage', 'employee:update']).filter((id) =>
    Types.ObjectId.isValid(id),
  );
  if (!canReadAll && locationIds.length === 0) {
    return { canCreateLocations: false, locations: [] };
  }
  const locations = await Location.find(
    canReadAll ? {} : { _id: { $in: locationIds.map((id) => new Types.ObjectId(id)) } },
  )
    .sort({ status: 1, name: 1 })
    .lean()
    .exec();
  const counts = await Employee.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { locationId: { $in: locations.map((location) => location._id) } } },
    { $group: { _id: '$locationId', count: { $sum: 1 } } },
  ]).exec();
  const countByLocation = new Map(counts.map((count) => [String(count._id), count.count]));

  return {
    canCreateLocations: hasCompanyGrant(user, 'policy:manage'),
    locations: locations.map((location) => ({
      id: String(location._id),
      code: location.code,
      name: location.name,
      status: location.status,
      employeeCount: countByLocation.get(String(location._id)) ?? 0,
      canManagePolicy: canManageHoliday(user, {
        scopeType: 'location',
        locationId: location._id,
      }),
      canAssignEmployees: canAssignAtLocation(user, location._id),
    })),
  };
}

export async function createLocation(
  user: AuthUser,
  input: CreateLocationRequest,
): Promise<LocationDirectoryDto> {
  await ensureIndexes();
  if (!hasCompanyGrant(user, 'policy:manage')) {
    throw new HttpError(403, 'Creating locations requires company policy scope', 'SCOPE_FORBIDDEN');
  }
  try {
    await Location.create({
      ...input,
      status: 'active',
      createdByUserId: new Types.ObjectId(user.id),
      updatedByUserId: new Types.ObjectId(user.id),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'A location with this code already exists', 'LOCATION_CODE_EXISTS');
    }
    throw error;
  }
  return listAdminLocations(user);
}

async function employeeLocationDto(
  employee: Pick<
    EmployeeDocument,
    '_id' | 'employeeCode' | 'firstName' | 'lastName' | 'locationId'
  >,
): Promise<EmployeeLocationAdministrationDto> {
  const [location, assignment] = await Promise.all([
    employee.locationId
      ? Location.findById(employee.locationId).select({ code: 1, name: 1 }).lean().exec()
      : null,
    EmployeeLocationAssignment.findOne({ employeeId: employee._id, effectiveUntil: null })
      .sort({ effectiveFrom: -1 })
      .lean()
      .exec(),
  ]);
  return {
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    employeeDisplayName: `${employee.firstName} ${employee.lastName}`.trim(),
    locationId: employee.locationId ? String(employee.locationId) : null,
    locationCode: location?.code ?? null,
    locationName: location?.name ?? null,
    effectiveFrom: assignment?.effectiveFrom ?? null,
  };
}

async function employeeForLocation(user: AuthUser, employeeCode: string) {
  const employee = await Employee.findOne({ employeeCode, status: 'active' }).lean().exec();
  if (!employee) throw new HttpError(404, 'Active employee not found', 'EMPLOYEE_NOT_FOUND');
  if (!canAssignEmployeeLocation(user, employee, employee.locationId)) {
    throw new HttpError(403, 'This employee is outside your location scope', 'SCOPE_FORBIDDEN');
  }
  return employee;
}

export async function getEmployeeLocation(
  user: AuthUser,
  employeeCode: string,
): Promise<EmployeeLocationAdministrationDto> {
  await ensureIndexes();
  return employeeLocationDto(await employeeForLocation(user, employeeCode));
}

function previousDate(workDate: string): string {
  return new Date(new Date(`${workDate}T00:00:00.000Z`).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function assertNoEmployeeLocationLeaveConflict(
  employeeId: Types.ObjectId,
  currentLocationId: Types.ObjectId | null,
  targetLocationId: Types.ObjectId | null,
  effectiveFrom: string,
): Promise<void> {
  const locationIds = [currentLocationId, targetLocationId].filter(
    (locationId): locationId is Types.ObjectId => locationId !== null,
  );
  if (locationIds.length === 0) return;
  const holidays = await Holiday.find({
    status: 'active',
    scopeType: 'location',
    locationId: { $in: locationIds },
    date: { $gte: effectiveFrom },
  })
    .select({ date: 1, locationId: 1 })
    .lean()
    .exec();
  const oldDates = new Set(
    holidays
      .filter((holiday) => currentLocationId?.equals(holiday.locationId))
      .map((holiday) => holiday.date),
  );
  const newDates = new Set(
    holidays
      .filter((holiday) => targetLocationId?.equals(holiday.locationId))
      .map((holiday) => holiday.date),
  );
  const changedDates = [
    ...new Set(
      [...oldDates, ...newDates].filter((date) => oldDates.has(date) !== newDates.has(date)),
    ),
  ];
  if (changedDates.length === 0) return;
  const conflict = await LeaveRequest.exists({
    employeeId,
    reservationActive: true,
    $or: changedDates.map((date) => ({ startDate: { $lte: date }, endDate: { $gte: date } })),
  });
  if (conflict) {
    throw new HttpError(
      409,
      'Active leave conflicts with the new location holiday calendar',
      'EMPLOYEE_LOCATION_LEAVE_CONFLICT',
    );
  }
}

export async function updateEmployeeLocation(
  user: AuthUser,
  employeeCode: string,
  input: UpdateEmployeeLocationRequest,
  now = new Date(),
): Promise<EmployeeLocationAdministrationDto> {
  await ensureIndexes();
  const employee = await Employee.findOne({ employeeCode, status: 'active' }).exec();
  if (!employee) throw new HttpError(404, 'Active employee not found', 'EMPLOYEE_NOT_FOUND');
  const targetLocationId = input.locationId ? new Types.ObjectId(input.locationId) : null;
  const targetLocation = targetLocationId
    ? await Location.findOne({ _id: targetLocationId, status: 'active' }).lean().exec()
    : null;
  if (targetLocationId && !targetLocation) {
    throw new HttpError(404, 'Active location not found', 'LOCATION_NOT_FOUND');
  }
  if (!canAssignEmployeeLocation(user, employee, targetLocationId)) {
    throw new HttpError(403, 'This location change is outside your scope', 'SCOPE_FORBIDDEN');
  }
  if (
    (employee.locationId === null && targetLocationId === null) ||
    employee.locationId?.equals(targetLocationId)
  ) {
    return employeeLocationDto(employee);
  }

  const effectiveFrom = getWorkDate(now);
  await assertNoEmployeeLocationLeaveConflict(
    employee._id,
    employee.locationId,
    targetLocationId,
    effectiveFrom,
  );
  const currentAssignment = await EmployeeLocationAssignment.findOne({
    employeeId: employee._id,
    effectiveUntil: null,
  }).exec();
  if (currentAssignment?.effectiveFrom === effectiveFrom) {
    currentAssignment.locationId = targetLocationId;
    currentAssignment.assignedByUserId = new Types.ObjectId(user.id);
    await currentAssignment.save();
  } else {
    if (currentAssignment) {
      currentAssignment.effectiveUntil = previousDate(effectiveFrom);
      await currentAssignment.save();
    } else if (employee.locationId) {
      const legacyFrom = getWorkDate(employee.createdAt);
      if (legacyFrom < effectiveFrom) {
        await EmployeeLocationAssignment.findOneAndUpdate(
          { employeeId: employee._id, effectiveFrom: legacyFrom },
          {
            $set: {
              locationId: employee.locationId,
              effectiveUntil: previousDate(effectiveFrom),
              assignedByUserId: new Types.ObjectId(user.id),
            },
          },
          { upsert: true, returnDocument: 'after', runValidators: true },
        ).exec();
      }
    }
    await EmployeeLocationAssignment.create({
      employeeId: employee._id,
      locationId: targetLocationId,
      effectiveFrom,
      effectiveUntil: null,
      assignedByUserId: new Types.ObjectId(user.id),
    });
  }
  employee.locationId = targetLocationId;
  await employee.save();
  if (await DailyTimecard.exists({ employeeId: employee._id, workDate: effectiveFrom })) {
    await reconcileDailyTimecard(String(employee._id), effectiveFrom, now);
  }
  return employeeLocationDto(employee);
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
