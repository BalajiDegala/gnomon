import {
  getWorkDate,
  type AuthUser,
  type CreateLeaveRequest,
  type LeaveApprovalRoutePreviewDto,
  type LeaveBalanceDto,
  type LeaveDecisionRequest,
  type LeaveRequestDto,
  type LeaveType,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import {
  markLeaveApprovalNotificationRead,
  notifyLeaveApprovalRequired,
  notifyLeaveOutcome,
  resolveLeaveApprovalNotifications,
} from '../notifications/notification.service.js';
import { listApplicableHolidays } from '../policies/holiday-applicability.service.js';
import { DepartmentApprovalPolicy } from '../policies/department-approval-policy.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { LeaveBalance, LeaveRequest, type LeaveRequestDocument } from './leave.model.js';

const APPROVAL_POLICY_VERSION = 'LEAVE_V1';
const leaveTypes: LeaveType[] = ['casual', 'sick', 'earned', 'unpaid'];
let indexesReady: Promise<unknown> | null = null;

function ensureIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([LeaveRequest.createIndexes(), LeaveBalance.createIndexes()]);
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

function employeeName(
  employee: Pick<EmployeeDocument, 'firstName' | 'lastName' | 'hrProfile'>,
): string {
  return employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`.trim();
}

async function previewLeaveApprovalRoute(
  employee: Pick<
    EmployeeDocument,
    '_id' | 'firstName' | 'lastName' | 'hrProfile' | 'reportingManagerId'
  >,
): Promise<LeaveApprovalRoutePreviewDto> {
  const policy = employee.hrProfile?.departmentName
    ? await DepartmentApprovalPolicy.findOne({
        departmentName: employee.hrProfile.departmentName,
      })
        .lean()
        .exec()
    : null;
  const approver1EmployeeId =
    policy?.approver1EmployeeId ??
    employee.hrProfile?.approver1EmployeeId ??
    employee.reportingManagerId;
  const approvalSteps: 1 | 2 = policy?.approvalSteps ?? 1;
  const approver2EmployeeIds =
    approvalSteps === 2
      ? policy?.approver2EmployeeIds?.length
        ? policy.approver2EmployeeIds
        : policy?.approver2EmployeeId
          ? [policy.approver2EmployeeId]
          : []
      : [];
  const approvers = await Employee.find({
    _id: { $in: [approver1EmployeeId, ...approver2EmployeeIds].filter(Boolean) },
    status: 'active',
  })
    .lean()
    .exec();
  const byId = new Map(approvers.map((approver) => [String(approver._id), approver]));
  const approver1 = approver1EmployeeId ? byId.get(String(approver1EmployeeId)) : undefined;
  return {
    approvalSteps,
    approver1DisplayName: approver1 ? employeeName(approver1) : null,
    approver2DisplayNames: approver2EmployeeIds.flatMap((employeeId) => {
      const approver = byId.get(String(employeeId));
      return approver ? [employeeName(approver)] : [];
    }),
  };
}

export function calculateLeaveWindow(
  input: CreateLeaveRequest,
  holidayDates: ReadonlySet<string> = new Set(),
) {
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);
  const calendarDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (calendarDays <= 0 || calendarDays > 60) {
    throw new HttpError(
      400,
      'A leave request can cover at most 60 calendar days',
      'LEAVE_TOO_LONG',
    );
  }

  const workingDates: string[] = [];
  for (let offset = 0; offset < calendarDays; offset += 1) {
    const date = new Date(start.getTime() + offset * 86_400_000);
    const isoDate = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !holidayDates.has(isoDate)) {
      workingDates.push(isoDate);
    }
  }
  if (workingDates.length === 0) {
    throw new HttpError(400, 'The selected range contains no working days', 'NO_WORKING_DAYS');
  }

  return {
    workingDates,
    requestedDays: input.dayPart === 'full_day' ? workingDates.length : 0.5,
  };
}

export function leaveDatesEligibleForReconciliation(workingDates: string[], now: Date): string[] {
  const currentWorkDate = getWorkDate(now);
  return workingDates.filter((workDate) => workDate <= currentWorkDate);
}

function toDto(
  request: LeaveRequestDocument,
  employee: Pick<EmployeeDocument, '_id' | 'employeeCode' | 'firstName' | 'lastName' | 'hrProfile'>,
): LeaveRequestDto {
  return {
    id: String(request._id),
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    employeeDisplayName: employeeName(employee),
    leaveType: request.leaveType,
    startDate: request.startDate,
    endDate: request.endDate,
    dayPart: request.dayPart,
    requestedDays: request.requestedDays,
    workingDates: request.workingDates,
    reason: request.reason,
    status: request.status,
    approvalSteps: request.approvalSteps ?? 1,
    currentStep: request.currentStep ?? (request.status === 'approved' ? 2 : 1),
    approver1DisplayName: request.approver1DisplayName ?? 'Reporting manager',
    approver2DisplayName: request.approver2DisplayName ?? null,
    approver2DisplayNames:
      request.approver2DisplayNames?.length > 0
        ? request.approver2DisplayNames
        : request.approver2DisplayName
          ? [request.approver2DisplayName]
          : [],
    approvalPolicyVersion: request.approvalPolicyVersion,
    decision: request.decision
      ? {
          step: request.decision.step ?? 1,
          decision: request.decision.decision,
          actorDisplayName: request.decision.actorDisplayName,
          actorRole: request.decision.actorRole,
          comment: request.decision.comment,
          decidedAt: request.decision.decidedAt.toISOString(),
        }
      : null,
    decisions: (request.decisions ?? (request.decision ? [request.decision] : [])).map(
      (decision) => ({
        step: decision.step ?? 1,
        decision: decision.decision,
        actorDisplayName: decision.actorDisplayName,
        actorRole: decision.actorRole,
        comment: decision.comment,
        decidedAt: decision.decidedAt.toISOString(),
      }),
    ),
    submittedAt: request.submittedAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function canApproveLeave(user: AuthUser, employee: EmployeeDocument): boolean {
  if (String(employee._id) === user.employeeId) return false;
  if (String(employee.reportingManagerId) !== user.employeeId) return false;
  return user.grants.some(
    (grant) =>
      ['REPORTING_MANAGER', 'SYSTEM_ADMIN'].includes(grant.roleCode) &&
      grant.permissions.includes('leave:approve') &&
      (grant.scope.type === 'company' ||
        (grant.scope.type === 'direct_reports' &&
          (grant.scope.ids.length === 0 || grant.scope.ids.includes(String(employee._id))))),
  );
}

async function buildBalances(employeeId: string, year: number): Promise<LeaveBalanceDto[]> {
  const [configured, requests] = await Promise.all([
    LeaveBalance.find({ employeeId, year }).lean().exec(),
    LeaveRequest.find({
      employeeId,
      startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
      status: { $in: ['pending_manager', 'pending_hr', 'approved'] },
    })
      .select({ leaveType: 1, requestedDays: 1, status: 1 })
      .lean()
      .exec(),
  ]);
  const configuredByType = new Map(configured.map((balance) => [balance.leaveType, balance]));

  return leaveTypes.map((leaveType) => {
    const balance = leaveType === 'unpaid' ? undefined : configuredByType.get(leaveType);
    const pendingDays = requests
      .filter(
        (request) =>
          request.leaveType === leaveType &&
          (request.status === 'pending_manager' || request.status === 'pending_hr'),
      )
      .reduce((total, request) => total + request.requestedDays, 0);
    const approvedDays = requests
      .filter((request) => request.leaveType === leaveType && request.status === 'approved')
      .reduce((total, request) => total + request.requestedDays, 0);
    const entitlement = balance ? balance.entitledDays + balance.adjustedDays : null;
    return {
      leaveType,
      year,
      entitledDays: balance?.entitledDays ?? null,
      adjustedDays: balance?.adjustedDays ?? null,
      pendingDays,
      approvedDays,
      availableDays: entitlement === null ? null : entitlement - pendingDays - approvedDays,
      balanceTracked: leaveType !== 'unpaid',
    };
  });
}

export async function listMyLeaves(user: AuthUser, year?: number) {
  await ensureIndexes();
  const employee = await Employee.findById(user.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  const selectedYear = year ?? Number(getWorkDate(new Date()).slice(0, 4));
  const requests = await LeaveRequest.find({
    employeeId: user.employeeId,
    startDate: { $gte: `${selectedYear}-01-01`, $lte: `${selectedYear}-12-31` },
  })
    .sort({ submittedAt: -1 })
    .lean()
    .exec();
  const [balances, holidays, approvalRoute] = await Promise.all([
    buildBalances(user.employeeId, selectedYear),
    listApplicableHolidays(user.employeeId, `${selectedYear}-01-01`, `${selectedYear}-12-31`),
    previewLeaveApprovalRoute(employee),
  ]);
  return {
    requests: requests.map((request) => toDto(request, employee)),
    balances,
    holidays,
    approvalRoute,
  };
}

export async function createLeave(
  user: AuthUser,
  input: CreateLeaveRequest,
  now = new Date(),
): Promise<LeaveRequestDto> {
  await ensureIndexes();
  const employee = await Employee.findOne({ _id: user.employeeId, status: 'active' }).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  const holidays = await listApplicableHolidays(user.employeeId, input.startDate, input.endDate);
  const window = calculateLeaveWindow(input, new Set(holidays.map((holiday) => holiday.date)));
  const policy = employee.hrProfile?.departmentName
    ? await DepartmentApprovalPolicy.findOne({
        departmentName: employee.hrProfile.departmentName,
      })
        .lean()
        .exec()
    : null;
  const approver1EmployeeId =
    policy?.approver1EmployeeId ??
    employee.hrProfile?.approver1EmployeeId ??
    employee.reportingManagerId;
  const approvalSteps: 1 | 2 = policy?.approvalSteps ?? 1;
  const configuredApprover2EmployeeIds =
    approvalSteps === 2
      ? policy?.approver2EmployeeIds?.length
        ? policy.approver2EmployeeIds
        : policy?.approver2EmployeeId
          ? [policy.approver2EmployeeId]
          : []
      : [];
  const approver2EmployeeIds = configuredApprover2EmployeeIds.filter(
    (employeeId) => String(employeeId) !== String(employee._id),
  );
  const approver2EmployeeId = approver2EmployeeIds[0] ?? null;
  if (!approver1EmployeeId) {
    throw new HttpError(
      409,
      'Approver 1 is not configured for this department',
      'LEAVE_APPROVER_REQUIRED',
    );
  }
  if (String(approver1EmployeeId) === String(employee._id)) {
    throw new HttpError(
      409,
      'Approver 1 cannot be the employee submitting leave',
      'SELF_APPROVAL_FORBIDDEN',
    );
  }
  if (approvalSteps === 2 && approver2EmployeeIds.length === 0) {
    throw new HttpError(
      409,
      'Approver 2 is required by this department policy',
      'SECOND_APPROVER_REQUIRED',
    );
  }
  const approvers = await Employee.find({
    _id: { $in: [approver1EmployeeId, ...approver2EmployeeIds] },
    status: 'active',
  })
    .lean()
    .exec();
  const approverById = new Map(approvers.map((approver) => [String(approver._id), approver]));
  const approver1 = approverById.get(String(approver1EmployeeId));
  const approver2s = approver2EmployeeIds.flatMap((employeeId) => {
    const approver = approverById.get(String(employeeId));
    return approver ? [approver] : [];
  });
  if (!approver1 || (approvalSteps === 2 && approver2s.length !== approver2EmployeeIds.length)) {
    throw new HttpError(409, 'A configured leave approver is inactive', 'APPROVER_INACTIVE');
  }

  const balances = await buildBalances(user.employeeId, Number(input.startDate.slice(0, 4)));
  const selectedBalance = balances.find((balance) => balance.leaveType === input.leaveType);
  if (
    selectedBalance?.availableDays !== null &&
    selectedBalance?.availableDays !== undefined &&
    window.requestedDays > selectedBalance.availableDays
  ) {
    throw new HttpError(
      409,
      'The request exceeds the configured leave balance',
      'BALANCE_EXCEEDED',
    );
  }
  if (
    await LeaveRequest.exists({
      employeeId: user.employeeId,
      reservationActive: true,
      reservedDates: { $in: window.workingDates },
    })
  ) {
    throw new HttpError(409, 'An active leave request overlaps these dates', 'LEAVE_OVERLAP');
  }

  try {
    const request = await LeaveRequest.create({
      employeeId: employee._id,
      managerEmployeeId: approver1EmployeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      dayPart: input.dayPart,
      requestedDays: window.requestedDays,
      workingDates: window.workingDates,
      reservedDates: window.workingDates,
      reservationActive: true,
      reason: input.reason,
      status: 'pending_manager',
      approvalSteps,
      currentStep: 1,
      approver1DisplayName: employeeName(approver1),
      approver2EmployeeId,
      approver2EmployeeIds,
      approver2DisplayName: approver2s.length > 0 ? approver2s.map(employeeName).join(', ') : null,
      approver2DisplayNames: approver2s.map(employeeName),
      approvalPolicyVersion: policy
        ? `DEPARTMENT:${String(policy._id)}:v${policy.version}`
        : APPROVAL_POLICY_VERSION,
      decision: null,
      decisions: [],
      submittedAt: now,
    });
    await notifyLeaveApprovalRequired(
      {
        requestId: request._id,
        employeeId: employee._id,
        employeeDisplayName: employeeName(employee),
        startDate: request.startDate,
        endDate: request.endDate,
        requestedDays: request.requestedDays,
      },
      [approver1EmployeeId],
      1,
    );
    return toDto(request, employee);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'An active leave request overlaps these dates', 'LEAVE_OVERLAP');
    }
    throw error;
  }
}

export async function cancelLeave(user: AuthUser, requestId: string): Promise<LeaveRequestDto> {
  const request = await LeaveRequest.findOneAndUpdate(
    {
      _id: requestId,
      employeeId: user.employeeId,
      status: { $in: ['pending_manager', 'pending_hr'] },
    },
    {
      $set: {
        status: 'cancelled',
        reservationActive: false,
        reservedDates: [],
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!request)
    throw new HttpError(404, 'Cancellable leave request not found', 'REQUEST_NOT_FOUND');
  await resolveLeaveApprovalNotifications(request._id);
  const employee = await Employee.findById(user.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  return toDto(request, employee);
}

export async function listLeaveApprovals(user: AuthUser): Promise<LeaveRequestDto[]> {
  await ensureIndexes();
  const companyOverride = user.grants.some(
    (grant) =>
      grant.roleCode === 'SYSTEM_ADMIN' &&
      grant.permissions.includes('leave:approve') &&
      grant.scope.type === 'company',
  );
  const requests = await LeaveRequest.find({
    status: { $in: ['pending_manager', 'pending_hr'] },
    employeeId: { $ne: user.employeeId },
    ...(companyOverride
      ? {}
      : {
          $or: [
            { status: 'pending_manager', managerEmployeeId: user.employeeId },
            { status: 'pending_hr', approver2EmployeeId: user.employeeId },
            { status: 'pending_hr', approver2EmployeeIds: user.employeeId },
          ],
        }),
  })
    .sort({ submittedAt: 1 })
    .lean()
    .exec();
  const employees = await Employee.find({
    _id: { $in: requests.map((request) => request.employeeId) },
  })
    .lean()
    .exec();
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  return requests.flatMap((request) => {
    const employee = employeeById.get(String(request.employeeId));
    return employee ? [toDto(request, employee)] : [];
  });
}

export async function decideLeave(
  user: AuthUser,
  requestId: string,
  input: LeaveDecisionRequest,
  now = new Date(),
): Promise<LeaveRequestDto> {
  const request = await LeaveRequest.findOne({
    _id: requestId,
    status: { $in: ['pending_manager', 'pending_hr'] },
  }).exec();
  if (!request) throw new HttpError(404, 'Pending leave request not found', 'REQUEST_NOT_FOUND');
  const employee = await Employee.findById(request.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  if (String(employee._id) === user.employeeId) {
    throw new HttpError(403, 'Self approval is not allowed', 'SELF_APPROVAL_FORBIDDEN');
  }
  const step: 1 | 2 = request.status === 'pending_manager' ? 1 : 2;
  const currentApproverIds =
    step === 1
      ? [request.managerEmployeeId]
      : request.approver2EmployeeIds?.length > 0
        ? request.approver2EmployeeIds
        : request.approver2EmployeeId
          ? [request.approver2EmployeeId]
          : [];
  const companyOverride = user.grants.some(
    (grant) =>
      grant.roleCode === 'SYSTEM_ADMIN' &&
      grant.permissions.includes('leave:approve') &&
      grant.scope.type === 'company',
  );
  if (
    !currentApproverIds.some((employeeId) => String(employeeId) === user.employeeId) &&
    !companyOverride
  ) {
    throw new HttpError(
      403,
      'This leave request is outside your approval scope',
      'SCOPE_FORBIDDEN',
    );
  }

  const approved = input.decision === 'approved';
  const finalApproval = approved && (step === 2 || (request.approvalSteps ?? 1) === 1);
  const nextStatus = approved ? (finalApproval ? 'approved' : 'pending_hr') : 'rejected';
  const actorRole = companyOverride
    ? 'system_admin'
    : step === 1
      ? 'reporting_manager'
      : 'department_approver';
  const decision = {
    step,
    decision: input.decision,
    actorUserId: new Types.ObjectId(user.id),
    actorEmployeeId: new Types.ObjectId(user.employeeId),
    actorDisplayName: user.displayName,
    actorRole,
    comment: input.comment,
    decidedAt: now,
  };
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: request.status },
    {
      $set: {
        status: nextStatus,
        currentStep: approved ? (finalApproval ? (step === 1 ? 2 : 3) : 2) : step,
        reservationActive: approved,
        ...(approved ? {} : { reservedDates: [] }),
        decision,
      },
      $push: { decisions: decision },
    },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!updated)
    throw new HttpError(409, 'The request was already decided', 'REQUEST_ALREADY_DECIDED');

  const notificationInput = {
    requestId: updated._id,
    employeeId: updated.employeeId,
    employeeDisplayName: employeeName(employee),
    startDate: updated.startDate,
    endDate: updated.endDate,
    requestedDays: updated.requestedDays,
  };
  await markLeaveApprovalNotificationRead(user.employeeId, updated._id);
  if (approved && !finalApproval) {
    const stage2EmployeeIds = updated.approver2EmployeeIds?.length
      ? updated.approver2EmployeeIds
      : updated.approver2EmployeeId
        ? [updated.approver2EmployeeId]
        : [];
    await notifyLeaveApprovalRequired(notificationInput, stage2EmployeeIds, 2);
  } else {
    await resolveLeaveApprovalNotifications(updated._id);
    await notifyLeaveOutcome(notificationInput, approved ? 'approved' : 'rejected');
  }

  if (finalApproval) {
    await Promise.all(
      leaveDatesEligibleForReconciliation(updated.workingDates, now).map((workDate) =>
        reconcileDailyTimecard(String(updated.employeeId), workDate, now),
      ),
    );
  }
  return toDto(updated, employee);
}
