import type {
  AssignSecurityRoleRequest,
  AuthUser,
  ProvisionEmployeeAccountRequest,
  RoleCode,
  ScopeType,
  SecurityDirectoryDto,
  UpdateEmployeeAccountRequest,
} from '@gnomon/shared';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { User } from '../auth/user.model.js';
import { Employee } from '../employees/employee.model.js';
import { Location } from '../employees/location.model.js';
import { Show } from '../shows/show.model.js';
import { Role, RoleAssignment } from './role.model.js';
import { SecurityAuditEvent } from './security-audit.model.js';
import { ensureSystemRoles } from './system-roles.js';

const allowedScopes: Record<RoleCode, ScopeType[]> = {
  EMPLOYEE: ['self'],
  REPORTING_MANAGER: ['direct_reports', 'company'],
  LEAVE_APPROVER: ['self'],
  SHOW_MANAGER: ['show', 'company'],
  HR: ['department', 'location', 'company'],
  ATTENDANCE_ADMIN: ['department', 'location', 'company'],
  SYSTEM_ADMIN: ['company'],
};

function assertSecurityAdministrator(user: AuthUser): void {
  const allowed = user.grants.some(
    (grant) => grant.roleCode === 'SYSTEM_ADMIN' && grant.scope.type === 'company',
  );
  if (!allowed) {
    throw new HttpError(
      403,
      'System Administrator company scope is required',
      'SECURITY_ADMIN_REQUIRED',
    );
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function ensureSecurityIndexes(): Promise<void> {
  await Promise.all([
    User.createIndexes(),
    RoleAssignment.createIndexes(),
    SecurityAuditEvent.createIndexes(),
  ]);
}

export async function listSecurityDirectory(user: AuthUser): Promise<SecurityDirectoryDto> {
  assertSecurityAdministrator(user);
  await ensureSystemRoles();
  const now = new Date();
  const [employees, users, roles, assignments, shows, locations] = await Promise.all([
    Employee.find({ profileSource: { $in: ['users_csv', 'biometric_csv', 'manual', 'system'] } })
      .sort({ status: 1, 'hrProfile.fullName': 1, firstName: 1, lastName: 1 })
      .limit(500)
      .lean()
      .exec(),
    User.find().lean().exec(),
    Role.find().sort({ name: 1 }).lean().exec(),
    RoleAssignment.find({
      validFrom: { $lte: now },
      $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
    })
      .sort({ validFrom: 1 })
      .lean()
      .exec(),
    Show.find({ status: { $in: ['active', 'on_hold'] } })
      .select({ code: 1, name: 1 })
      .sort({ name: 1 })
      .lean()
      .exec(),
    Location.find({ status: 'active' })
      .select({ code: 1, name: 1 })
      .sort({ name: 1 })
      .lean()
      .exec(),
  ]);
  const userByEmployeeId = new Map(users.map((account) => [String(account.employeeId), account]));
  const roleById = new Map(roles.map((role) => [String(role._id), role]));

  return {
    employees: employees.map((employee) => {
      const account = userByEmployeeId.get(String(employee._id));
      const accountAssignments = account
        ? assignments.filter((assignment) => assignment.userId.equals(account._id))
        : [];
      return {
        employeeId: String(employee._id),
        employeeCode: employee.employeeCode,
        employeeDisplayName:
          employee.hrProfile?.fullName ??
          employee.biometricProfile?.fullName ??
          `${employee.firstName} ${employee.lastName}`.trim(),
        employeeEmail: employee.hrProfile?.mailId ?? employee.email,
        employeeStatus: employee.status,
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
        account: account
          ? {
              userId: String(account._id),
              email: account.email,
              status: account.status,
              lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
              assignments: accountAssignments.flatMap((assignment) => {
                const role = roleById.get(String(assignment.roleId));
                if (!role) return [];
                return [
                  {
                    id: String(assignment._id),
                    roleCode: role.code,
                    roleName: role.name,
                    scopeType: assignment.scopeType,
                    scopeIds: assignment.scopeIds.map(String),
                    validFrom: assignment.validFrom.toISOString(),
                  },
                ];
              }),
            }
          : null,
      };
    }),
    roles: roles.map((role) => ({
      id: String(role._id),
      code: role.code,
      name: role.name,
      permissions: role.permissions,
    })),
    scopeOptions: {
      shows: shows.map((show) => ({ id: String(show._id), code: show.code, name: show.name })),
      locations: locations.map((location) => ({
        id: String(location._id),
        code: location.code,
        name: location.name,
      })),
    },
  };
}

export async function provisionEmployeeAccount(
  actor: AuthUser,
  input: ProvisionEmployeeAccountRequest,
): Promise<SecurityDirectoryDto> {
  assertSecurityAdministrator(actor);
  await ensureSecurityIndexes();
  const employee = await Employee.findOne({ _id: input.employeeId, status: 'active' })
    .lean()
    .exec();
  if (!employee) throw new HttpError(404, 'Active employee not found', 'EMPLOYEE_NOT_FOUND');
  const existing = await User.exists({ employeeId: employee._id });
  if (existing) throw new HttpError(409, 'This employee already has an account', 'ACCOUNT_EXISTS');

  try {
    const account = await User.create({
      employeeId: employee._id,
      email: employee.email,
      passwordHash: await bcrypt.hash(input.temporaryPassword, 12),
      status: 'active',
      tokenVersion: 0,
    });
    const roles = await ensureSystemRoles();
    const employeeRole = roles.get('EMPLOYEE');
    if (!employeeRole) throw new Error('Employee role is unavailable');
    await RoleAssignment.create({
      userId: account._id,
      roleId: employeeRole._id,
      scopeType: 'self',
      scopeIds: [employee._id],
      validFrom: new Date(),
      validUntil: null,
      grantedBy: actor.id,
    });
    await SecurityAuditEvent.create({
      actorUserId: actor.id,
      targetUserId: account._id,
      action: 'account_provisioned',
      details: { employeeId: String(employee._id), email: employee.email },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'An account already uses this employee or email', 'ACCOUNT_EXISTS');
    }
    throw error;
  }
  return listSecurityDirectory(actor);
}

async function normalizeScopeIds(
  accountEmployeeId: Types.ObjectId,
  input: AssignSecurityRoleRequest,
): Promise<Types.ObjectId[]> {
  if (!allowedScopes[input.roleCode].includes(input.scopeType)) {
    throw new HttpError(400, 'This scope is not valid for the selected role', 'INVALID_ROLE_SCOPE');
  }
  if (input.scopeType === 'self') return [accountEmployeeId];
  if (input.scopeType === 'company') return [];
  const ids = input.scopeIds.map((id) => new Types.ObjectId(id));
  if (input.scopeType !== 'direct_reports' && ids.length === 0) {
    throw new HttpError(400, 'At least one scope target is required', 'SCOPE_TARGET_REQUIRED');
  }
  if (input.scopeType === 'show') {
    const count = await Show.countDocuments({ _id: { $in: ids } });
    if (count !== ids.length)
      throw new HttpError(400, 'One or more shows are invalid', 'INVALID_SCOPE');
  }
  if (input.scopeType === 'location') {
    const count = await Location.countDocuments({ _id: { $in: ids }, status: 'active' });
    if (count !== ids.length) {
      throw new HttpError(400, 'One or more locations are invalid', 'INVALID_SCOPE');
    }
  }
  if (input.scopeType === 'direct_reports' && ids.length > 0) {
    const count = await Employee.countDocuments({
      _id: { $in: ids },
      reportingManagerId: accountEmployeeId,
      status: 'active',
    });
    if (count !== ids.length) {
      throw new HttpError(400, 'Direct-report scope contains an invalid employee', 'INVALID_SCOPE');
    }
  }
  return ids;
}

export async function assignSecurityRole(
  actor: AuthUser,
  userId: string,
  input: AssignSecurityRoleRequest,
): Promise<SecurityDirectoryDto> {
  assertSecurityAdministrator(actor);
  const [account, role] = await Promise.all([
    User.findById(userId).lean().exec(),
    Role.findOne({ code: input.roleCode }).lean().exec(),
  ]);
  if (!account) throw new HttpError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
  if (!role) throw new HttpError(404, 'System role not found', 'ROLE_NOT_FOUND');
  const scopeIds = await normalizeScopeIds(account.employeeId, input);
  const assignment = await RoleAssignment.findOneAndUpdate(
    { userId: account._id, roleId: role._id, scopeType: input.scopeType, validUntil: null },
    {
      $set: { scopeIds, validFrom: new Date(), validUntil: null, grantedBy: actor.id },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  await SecurityAuditEvent.create({
    actorUserId: actor.id,
    targetUserId: account._id,
    action: 'role_assigned',
    details: {
      assignmentId: String(assignment._id),
      roleCode: role.code,
      scopeType: input.scopeType,
      scopeIds: scopeIds.map(String),
    },
  });
  return listSecurityDirectory(actor);
}

export async function revokeSecurityRole(
  actor: AuthUser,
  userId: string,
  assignmentId: string,
): Promise<SecurityDirectoryDto> {
  assertSecurityAdministrator(actor);
  const assignment = await RoleAssignment.findOne({
    _id: assignmentId,
    userId,
    validUntil: null,
  }).exec();
  if (!assignment)
    throw new HttpError(404, 'Active role assignment not found', 'ASSIGNMENT_NOT_FOUND');
  const role = await Role.findById(assignment.roleId).lean().exec();
  if (userId === actor.id && role?.code === 'SYSTEM_ADMIN') {
    throw new HttpError(
      409,
      'You cannot revoke your own System Administrator role',
      'SELF_LOCKOUT',
    );
  }
  assignment.validUntil = new Date();
  await assignment.save();
  await SecurityAuditEvent.create({
    actorUserId: actor.id,
    targetUserId: userId,
    action: 'role_revoked',
    details: { assignmentId, roleCode: role?.code ?? 'UNKNOWN' },
  });
  return listSecurityDirectory(actor);
}

export async function updateEmployeeAccount(
  actor: AuthUser,
  userId: string,
  input: UpdateEmployeeAccountRequest,
): Promise<SecurityDirectoryDto> {
  assertSecurityAdministrator(actor);
  if (userId === actor.id && input.status && input.status !== 'active') {
    throw new HttpError(409, 'You cannot disable your own account', 'SELF_LOCKOUT');
  }
  const account = await User.findById(userId).select('+passwordHash').exec();
  if (!account) throw new HttpError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
  if (input.status) account.status = input.status;
  if (input.temporaryPassword)
    account.passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
  account.tokenVersion += 1;
  await account.save();
  await SecurityAuditEvent.create({
    actorUserId: actor.id,
    targetUserId: account._id,
    action: 'account_updated',
    details: { status: input.status, passwordReset: Boolean(input.temporaryPassword) },
  });
  return listSecurityDirectory(actor);
}
