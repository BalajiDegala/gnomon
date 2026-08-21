import type {
  ApprovalEmployeeOption,
  ApprovalPreferencesDto,
  AuthUser,
  DepartmentApprovalPolicyDto,
  UpdateDepartmentApprovalPolicyRequest,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { User } from '../auth/user.model.js';
import { Employee } from '../employees/employee.model.js';
import { Role, RoleAssignment } from '../roles/role.model.js';
import {
  DepartmentApprovalPolicy,
  type DepartmentApprovalPolicyRecord,
} from './department-approval-policy.model.js';

function employeeName(employee: {
  firstName: string;
  lastName: string;
  hrProfile?: { fullName: string } | null;
}) {
  return employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`.trim();
}

function option(
  employee: {
    _id: unknown;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email: string;
    hrProfile?: { fullName: string; mailId: string; departmentName: string } | null;
  },
  readiness: { hasActiveAccount: boolean; canApproveLeave: boolean },
): ApprovalEmployeeOption {
  return {
    id: String(employee._id),
    employeeCode: employee.employeeCode,
    displayName: employeeName(employee),
    email: employee.hrProfile?.mailId ?? employee.email,
    departmentName: employee.hrProfile?.departmentName ?? null,
    ...readiness,
  };
}

async function directory() {
  return Employee.find({ status: 'active', profileSource: 'users_csv' })
    .sort({ 'hrProfile.fullName': 1, employeeCode: 1 })
    .lean()
    .exec();
}

function toDto(
  policy:
    DepartmentApprovalPolicyRecord | (Record<string, unknown> & DepartmentApprovalPolicyRecord),
  employeesById: Map<string, ApprovalEmployeeOption>,
  employeeCount: number,
): DepartmentApprovalPolicyDto {
  const approver2Ids =
    policy.approver2EmployeeIds?.length > 0
      ? policy.approver2EmployeeIds
      : policy.approver2EmployeeId
        ? [policy.approver2EmployeeId]
        : [];
  const approver2s = approver2Ids.flatMap((employeeId) => {
    const employee = employeesById.get(String(employeeId));
    return employee ? [employee] : [];
  });
  const importedApprover2Names =
    policy.importedApprover2Names?.length > 0
      ? policy.importedApprover2Names
      : policy.importedApprover2Name
        ? [policy.importedApprover2Name]
        : [];
  return {
    id: String(policy._id),
    departmentName: policy.departmentName,
    approvalSteps: policy.approvalSteps,
    approver1: policy.approver1EmployeeId
      ? (employeesById.get(String(policy.approver1EmployeeId)) ?? null)
      : null,
    approver2: approver2s[0] ?? null,
    approver2s,
    importedApprover1Name: policy.importedApprover1Name,
    importedApprover2Name: policy.importedApprover2Name,
    importedApprover2Names,
    emailTriggers: policy.emailTriggers,
    employeeCount,
    version: policy.version,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export async function listApprovalPreferences(): Promise<ApprovalPreferencesDto> {
  const [employees, policies, approvalRoles] = await Promise.all([
    directory(),
    DepartmentApprovalPolicy.find().sort({ departmentName: 1 }).exec(),
    Role.find({ permissions: 'leave:approve' }).select({ _id: 1 }).lean().exec(),
  ]);
  const users = await User.find({
    employeeId: { $in: employees.map((employee) => employee._id) },
    status: 'active',
  })
    .select({ employeeId: 1 })
    .lean()
    .exec();
  const now = new Date();
  const assignments = await RoleAssignment.find({
    userId: { $in: users.map((user) => user._id) },
    roleId: { $in: approvalRoles.map((role) => role._id) },
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
  })
    .select({ userId: 1 })
    .lean()
    .exec();
  const employeeByUserId = new Map(
    users.map((user) => [String(user._id), String(user.employeeId)]),
  );
  const activeAccountEmployeeIds = new Set(users.map((user) => String(user.employeeId)));
  const leaveApproverEmployeeIds = new Set(
    assignments.flatMap((assignment) => {
      const employeeId = employeeByUserId.get(String(assignment.userId));
      return employeeId ? [employeeId] : [];
    }),
  );
  const employeeOptions = employees.map((employee) =>
    option(employee, {
      hasActiveAccount: activeAccountEmployeeIds.has(String(employee._id)),
      canApproveLeave: leaveApproverEmployeeIds.has(String(employee._id)),
    }),
  );
  const byId = new Map(employeeOptions.map((employee) => [employee.id, employee]));
  const counts = new Map<string, number>();
  for (const employee of employees) {
    const department = employee.hrProfile?.departmentName;
    if (department) counts.set(department, (counts.get(department) ?? 0) + 1);
  }
  return {
    employeeOptions,
    policies: policies.map((policy) => toDto(policy, byId, counts.get(policy.departmentName) ?? 0)),
  };
}

export async function updateDepartmentApprovalPolicy(
  user: AuthUser,
  policyId: string,
  input: UpdateDepartmentApprovalPolicyRequest,
): Promise<ApprovalPreferencesDto> {
  const requestedApprover2Ids =
    input.approver2EmployeeIds.length > 0
      ? input.approver2EmployeeIds
      : input.approver2EmployeeId
        ? [input.approver2EmployeeId]
        : [];
  const approver2EmployeeIds = input.approvalSteps === 2 ? [...new Set(requestedApprover2Ids)] : [];
  const approverIds = [...new Set([input.approver1EmployeeId, ...approver2EmployeeIds])];
  const count = await Employee.countDocuments({
    _id: { $in: approverIds.map((id) => new Types.ObjectId(id)) },
    status: 'active',
    profileSource: 'users_csv',
  });
  if (count !== approverIds.length) {
    throw new HttpError(400, 'One or more approvers are not active HR users', 'INVALID_APPROVER');
  }
  const updated = await DepartmentApprovalPolicy.findByIdAndUpdate(
    policyId,
    {
      $set: {
        approvalSteps: input.approvalSteps,
        approver1EmployeeId: new Types.ObjectId(input.approver1EmployeeId),
        approver2EmployeeId: approver2EmployeeIds[0]
          ? new Types.ObjectId(approver2EmployeeIds[0])
          : null,
        approver2EmployeeIds: approver2EmployeeIds.map((id) => new Types.ObjectId(id)),
        emailTriggers: [...new Set(input.emailTriggers.map((email) => email.toLowerCase()))],
        updatedByUserId: new Types.ObjectId(user.id),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!updated) throw new HttpError(404, 'Approval policy not found', 'POLICY_NOT_FOUND');
  return listApprovalPreferences();
}
