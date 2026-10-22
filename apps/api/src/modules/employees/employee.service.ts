import type {
  AuthUser,
  CreateEmployeeRequest,
  EmployeeDirectoryDto,
  EmployeeDirectoryItemDto,
  EmployeeStatus,
  UpdateEmployeeRequest,
} from '@gnomon/shared';
import { Types, type QueryFilter } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { User } from '../auth/user.model.js';
import { Location } from './location.model.js';
import { EmployeeAuditEvent } from './employee-audit.model.js';
import { Employee, type EmployeeDocument } from './employee.model.js';
import {
  assertEmployeeInScope,
  buildEmployeeScopeFilter,
  hasCompanyEmployeePermission,
} from './employee-scope.service.js';

let indexesReady: Promise<unknown> | null = null;

function ensureIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([Employee.createIndexes(), EmployeeAuditEvent.createIndexes()]);
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function toDirectoryItems(
  employees: Array<
    Pick<
      EmployeeDocument,
      | '_id'
      | 'employeeCode'
      | 'firstName'
      | 'lastName'
      | 'email'
      | 'timezone'
      | 'status'
      | 'attendanceIdentity'
      | 'profileSource'
      | 'hrProfile'
      | 'biometricProfile'
      | 'reportingManagerId'
      | 'locationId'
      | 'updatedAt'
    >
  >,
): Promise<EmployeeDirectoryItemDto[]> {
  const managerIds = employees
    .map((employee) => employee.reportingManagerId)
    .filter((id): id is Types.ObjectId => Boolean(id));
  const locationIds = employees
    .map((employee) => employee.locationId)
    .filter((id): id is Types.ObjectId => Boolean(id));
  const [managers, locations] = await Promise.all([
    Employee.find({ _id: { $in: managerIds } })
      .select({ employeeCode: 1, firstName: 1, lastName: 1, hrProfile: 1 })
      .lean()
      .exec(),
    Location.find({ _id: { $in: locationIds } })
      .select({ code: 1, name: 1 })
      .lean()
      .exec(),
  ]);
  const managerById = new Map(managers.map((manager) => [String(manager._id), manager]));
  const locationById = new Map(locations.map((location) => [String(location._id), location]));

  return employees.map((employee) => {
    const manager = employee.reportingManagerId
      ? managerById.get(String(employee.reportingManagerId))
      : null;
    const location = employee.locationId ? locationById.get(String(employee.locationId)) : null;
    return {
      id: String(employee._id),
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName:
        employee.hrProfile?.fullName ??
        employee.biometricProfile?.fullName ??
        `${employee.firstName} ${employee.lastName}`.trim(),
      email: employee.hrProfile?.mailId ?? employee.email,
      timezone: employee.timezone,
      status: employee.status,
      profileSource: employee.profileSource,
      biometricProfile: employee.biometricProfile
        ? {
            ...employee.biometricProfile,
            importedAt: employee.biometricProfile.importedAt.toISOString(),
          }
        : null,
      hrProfile: employee.hrProfile
        ? {
            source: employee.hrProfile.source,
            userId: employee.hrProfile.userId,
            mailId: employee.hrProfile.mailId,
            fullName: employee.hrProfile.fullName,
            designation: employee.hrProfile.designation,
            departmentName: employee.hrProfile.departmentName,
            leaveApprover1Name: employee.hrProfile.leaveApprover1Name,
            leaveApprover2Name: employee.hrProfile.leaveApprover2Name,
            approver1EmployeeId: employee.hrProfile.approver1EmployeeId
              ? String(employee.hrProfile.approver1EmployeeId)
              : null,
            approver2EmployeeId: employee.hrProfile.approver2EmployeeId
              ? String(employee.hrProfile.approver2EmployeeId)
              : null,
            emailTriggers: employee.hrProfile.emailTriggers,
            importedAt: employee.hrProfile.importedAt.toISOString(),
          }
        : null,
      attendanceIdentity: employee.attendanceIdentity
        ? {
            source: employee.attendanceIdentity.source,
            personnelId: employee.attendanceIdentity.personnelId,
            cardNumber: employee.attendanceIdentity.cardNumber,
            departmentName: employee.attendanceIdentity.departmentName,
            lastSeenAt: employee.attendanceIdentity.lastSeenAt.toISOString(),
          }
        : null,
      reportingManager: manager
        ? {
            id: String(manager._id),
            employeeCode: manager.employeeCode,
            displayName:
              manager.hrProfile?.fullName ?? `${manager.firstName} ${manager.lastName}`.trim(),
          }
        : null,
      location: location
        ? { id: String(location._id), code: location.code, name: location.name }
        : null,
      updatedAt: employee.updatedAt.toISOString(),
    };
  });
}

export async function listEmployees(
  user: AuthUser,
  input: { search?: string; status?: EmployeeStatus },
): Promise<EmployeeDirectoryDto> {
  await ensureIndexes();
  const scope = await buildEmployeeScopeFilter(user, ['employee:read']);
  const filters: QueryFilter<EmployeeDocument>[] = [
    scope,
    { profileSource: { $in: ['users_csv', 'biometric_csv', 'manual'] } },
  ];
  if (input.status) filters.push({ status: input.status });
  if (input.search) {
    const search = new RegExp(escapeRegex(input.search), 'i');
    filters.push({
      $or: [
        { employeeCode: search },
        { firstName: search },
        { lastName: search },
        { email: search },
        { 'hrProfile.userId': search },
        { 'hrProfile.fullName': search },
        { 'hrProfile.designation': search },
        { 'hrProfile.departmentName': search },
        { 'biometricProfile.fullName': search },
        { 'biometricProfile.designation': search },
        { 'biometricProfile.departmentName': search },
        { 'hrProfile.leaveApprover1Name': search },
        { 'hrProfile.leaveApprover2Name': search },
      ],
    });
  }
  const employees = await Employee.find({ $and: filters })
    .sort({ status: 1, 'hrProfile.fullName': 1, firstName: 1, lastName: 1, employeeCode: 1 })
    .limit(500)
    .lean()
    .exec();
  return {
    employees: await toDirectoryItems(employees),
    canCreate: hasCompanyEmployeePermission(user, 'employee:update'),
    canUpdate: user.permissions.includes('employee:update'),
  };
}

async function validateManager(managerId: string | null, employeeId?: string): Promise<void> {
  if (managerId === null) return;
  if (managerId === employeeId) {
    throw new HttpError(
      400,
      'An employee cannot report to themselves',
      'INVALID_REPORTING_MANAGER',
    );
  }
  const manager = await Employee.exists({ _id: managerId, status: 'active' });
  if (!manager) {
    throw new HttpError(
      400,
      'The reporting manager must be an active employee',
      'INVALID_REPORTING_MANAGER',
    );
  }
}

export async function createEmployee(
  user: AuthUser,
  input: CreateEmployeeRequest,
): Promise<EmployeeDirectoryItemDto> {
  await ensureIndexes();
  if (!hasCompanyEmployeePermission(user, 'employee:update')) {
    throw new HttpError(403, 'Creating employees requires company scope', 'SCOPE_FORBIDDEN');
  }
  await validateManager(input.reportingManagerId);
  try {
    const employee = await Employee.create({
      ...input,
      reportingManagerId: input.reportingManagerId
        ? new Types.ObjectId(input.reportingManagerId)
        : null,
      status: 'active',
    });
    await EmployeeAuditEvent.create({
      employeeId: employee._id,
      actorUserId: user.id,
      action: 'created',
      changes: { employeeCode: employee.employeeCode, status: employee.status },
    });
    return (await toDirectoryItems([employee.toObject()]))[0]!;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'The employee code or email already exists', 'EMPLOYEE_EXISTS');
    }
    throw error;
  }
}

export async function updateEmployee(
  user: AuthUser,
  employeeId: string,
  input: UpdateEmployeeRequest,
): Promise<EmployeeDirectoryItemDto> {
  await ensureIndexes();
  await assertEmployeeInScope(user, employeeId, 'employee:update');
  await validateManager(input.reportingManagerId ?? null, employeeId);
  const before = await Employee.findById(employeeId).lean().exec();
  if (!before) throw new HttpError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
  if (input.email) {
    const conflictingAccount = await User.exists({
      email: input.email,
      employeeId: { $ne: before._id },
    });
    if (conflictingAccount) {
      throw new HttpError(
        409,
        'The employee email is already used by another login account',
        'EMPLOYEE_EMAIL_EXISTS',
      );
    }
  }

  const changes = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      { from: before[key as keyof typeof before], to: value },
    ]),
  );
  try {
    const employee = await Employee.findByIdAndUpdate(
      employeeId,
      {
        $set: {
          ...input,
          ...(input.reportingManagerId !== undefined
            ? {
                reportingManagerId: input.reportingManagerId
                  ? new Types.ObjectId(input.reportingManagerId)
                  : null,
              }
            : {}),
        },
      },
      { returnDocument: 'after', runValidators: true },
    )
      .lean()
      .exec();
    if (!employee) throw new HttpError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
    if (input.email || input.status === 'inactive') {
      await User.findOneAndUpdate(
        { employeeId: employee._id },
        {
          $set: {
            ...(input.email ? { email: input.email } : {}),
            ...(input.status === 'inactive' ? { status: 'inactive' } : {}),
          },
          ...(input.status === 'inactive' ? { $inc: { tokenVersion: 1 } } : {}),
        },
        { runValidators: true },
      ).exec();
    }
    await EmployeeAuditEvent.create({
      employeeId: employee._id,
      actorUserId: user.id,
      action: 'updated',
      changes,
    });
    return (await toDirectoryItems([employee]))[0]!;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'The employee email already exists', 'EMPLOYEE_EMAIL_EXISTS');
    }
    throw error;
  }
}
