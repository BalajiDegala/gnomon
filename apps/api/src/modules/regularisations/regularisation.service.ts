import {
  getWorkDate,
  getWorkdayWindow,
  type AuthUser,
  type CreateRegularisationRequest,
  type RegularisationDecisionRequest,
  type RegularisationRequestDto,
  type RoleCode,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import {
  RegularisationRequest,
  type RegularisationActorRole,
  type RegularisationRequestDocument,
} from './regularisation.model.js';

const APPROVAL_POLICY_VERSION = 'REGULARISATION_V1';
const ACTIVE_OR_APPROVED_STATUSES = ['pending_manager', 'pending_hr', 'approved'] as const;

let indexesReady: Promise<unknown> | null = null;

function ensureIndexes(): Promise<unknown> {
  indexesReady ??= RegularisationRequest.createIndexes();
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

function requestedMinutes(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function employeeName(employee: Pick<EmployeeDocument, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function toDto(
  request: RegularisationRequestDocument,
  employee: Pick<EmployeeDocument, '_id' | 'employeeCode' | 'firstName' | 'lastName'>,
): RegularisationRequestDto {
  return {
    id: String(request._id),
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    employeeDisplayName: employeeName(employee),
    workDate: request.workDate,
    source: request.source,
    missingEvent: request.missingEvent,
    requestedStart: request.requestedStart.toISOString(),
    requestedEnd: request.requestedEnd.toISOString(),
    requestedMinutes: request.requestedMinutes,
    reason: request.reason,
    status: request.status,
    currentStep: request.currentStep,
    approvalPolicyVersion: request.approvalPolicyVersion,
    decisions: request.decisions.map((decision) => ({
      step: decision.step,
      decision: decision.decision,
      actorDisplayName: decision.actorDisplayName,
      actorRole: decision.actorRole,
      comment: decision.comment,
      decidedAt: decision.decidedAt.toISOString(),
    })),
    submittedAt: request.submittedAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function regularisationKey(
  employeeId: string,
  input: Pick<CreateRegularisationRequest, 'workDate' | 'source' | 'missingEvent'>,
): string {
  return [employeeId, input.workDate, input.source, input.missingEvent].join(':');
}

export function validateCorrectionWindow(input: CreateRegularisationRequest, now: Date) {
  if (input.workDate > getWorkDate(now)) {
    throw new HttpError(400, 'A future work date cannot be regularised', 'FUTURE_WORK_DATE');
  }
  const workdayWindow = getWorkdayWindow(input.workDate);
  if (now < workdayWindow.end) {
    throw new HttpError(
      409,
      'Regularisation is available after the 07:00 workday window closes',
      'WORKDAY_STILL_OPEN',
    );
  }

  const start = new Date(input.requestedStart);
  const end = new Date(input.requestedEnd);
  const duration = requestedMinutes(start, end);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start ||
    duration > 1_440
  ) {
    throw new HttpError(400, 'The corrected time window is invalid', 'INVALID_CORRECTION_WINDOW');
  }
  if (
    getWorkDate(start) !== input.workDate ||
    getWorkDate(new Date(end.getTime() - 1)) !== input.workDate
  ) {
    throw new HttpError(
      400,
      'Corrected time must stay inside the selected 07:00-to-07:00 workday',
      'CORRECTION_CROSSES_WORKDAY',
    );
  }
  return { start, end, duration };
}

function hasRoleGrant(user: AuthUser, roleCodes: RoleCode[], scopeTypes?: string[]): boolean {
  return user.grants.some(
    (grant) =>
      roleCodes.includes(grant.roleCode) &&
      grant.permissions.includes('regularisation:approve') &&
      (!scopeTypes || scopeTypes.includes(grant.scope.type)),
  );
}

export function canApproveManagerStep(user: AuthUser, employee: EmployeeDocument): boolean {
  if (String(employee._id) === user.employeeId) return false;
  if (String(employee.reportingManagerId) !== user.employeeId) return false;

  return user.grants.some(
    (grant) =>
      ['REPORTING_MANAGER', 'SYSTEM_ADMIN'].includes(grant.roleCode) &&
      grant.permissions.includes('regularisation:approve') &&
      (grant.scope.type === 'company' ||
        (grant.scope.type === 'direct_reports' &&
          (grant.scope.ids.length === 0 || grant.scope.ids.includes(String(employee._id))))),
  );
}

export function canApproveHrStep(user: AuthUser, employee: EmployeeDocument): boolean {
  if (String(employee._id) === user.employeeId) return false;

  return user.grants.some((grant) => {
    if (
      !['HR', 'ATTENDANCE_ADMIN', 'SYSTEM_ADMIN'].includes(grant.roleCode) ||
      !grant.permissions.includes('regularisation:approve')
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

function actorRole(user: AuthUser, step: 1 | 2): RegularisationActorRole {
  const candidates: Array<[RoleCode, RegularisationActorRole]> =
    step === 1
      ? [
          ['REPORTING_MANAGER', 'reporting_manager'],
          ['SYSTEM_ADMIN', 'system_admin'],
        ]
      : [
          ['HR', 'hr'],
          ['ATTENDANCE_ADMIN', 'attendance_admin'],
          ['SYSTEM_ADMIN', 'system_admin'],
        ];
  return (
    candidates.find(([role]) => user.grants.some((grant) => grant.roleCode === role))?.[1] ??
    (step === 1 ? 'reporting_manager' : 'attendance_admin')
  );
}

export async function listMyRegularisations(user: AuthUser): Promise<RegularisationRequestDto[]> {
  await ensureIndexes();
  const employee = await Employee.findById(user.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  const requests = await RegularisationRequest.find({ employeeId: user.employeeId })
    .sort({ submittedAt: -1 })
    .lean()
    .exec();
  return requests.map((request) => toDto(request, employee));
}

export async function createRegularisation(
  user: AuthUser,
  input: CreateRegularisationRequest,
  now = new Date(),
): Promise<RegularisationRequestDto> {
  await ensureIndexes();
  const correction = validateCorrectionWindow(input, now);
  const employee = await Employee.findOne({ _id: user.employeeId, status: 'active' }).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  if (!employee.reportingManagerId) {
    throw new HttpError(
      409,
      'A Reporting Manager must be assigned before regularisation can be submitted',
      'REPORTING_MANAGER_REQUIRED',
    );
  }
  const managerExists = await Employee.exists({
    _id: employee.reportingManagerId,
    status: 'active',
  });
  if (!managerExists) {
    throw new HttpError(409, 'The assigned Reporting Manager is inactive', 'MANAGER_INACTIVE');
  }

  const deduplicationKey = regularisationKey(user.employeeId, input);
  const existing = await RegularisationRequest.exists({
    deduplicationKey,
    status: { $in: ACTIVE_OR_APPROVED_STATUSES },
  });
  if (existing) {
    throw new HttpError(
      409,
      'An active or approved request already covers this missing event',
      'REGULARISATION_EXISTS',
    );
  }

  try {
    const request = await RegularisationRequest.create({
      employeeId: employee._id,
      managerEmployeeId: employee.reportingManagerId,
      workDate: input.workDate,
      source: input.source,
      missingEvent: input.missingEvent,
      requestedStart: correction.start,
      requestedEnd: correction.end,
      requestedMinutes: correction.duration,
      reason: input.reason,
      status: 'pending_manager',
      currentStep: 1,
      approvalPolicyVersion: APPROVAL_POLICY_VERSION,
      deduplicationKey,
      decisions: [],
      submittedAt: now,
    });
    await reconcileDailyTimecard(user.employeeId, input.workDate, now);
    return toDto(request, employee);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(
        409,
        'An active or approved request already covers this missing event',
        'REGULARISATION_EXISTS',
      );
    }
    throw error;
  }
}

export async function cancelRegularisation(
  user: AuthUser,
  requestId: string,
  now = new Date(),
): Promise<RegularisationRequestDto> {
  const request = await RegularisationRequest.findOneAndUpdate(
    { _id: requestId, employeeId: user.employeeId, status: 'pending_manager' },
    { $set: { status: 'cancelled', deduplicationKey: null } },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!request) {
    throw new HttpError(404, 'Cancellable regularisation request not found', 'REQUEST_NOT_FOUND');
  }
  const employee = await Employee.findById(user.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  await reconcileDailyTimecard(user.employeeId, request.workDate, now);
  return toDto(request, employee);
}

export async function listRegularisationApprovals(
  user: AuthUser,
): Promise<RegularisationRequestDto[]> {
  await ensureIndexes();
  const managerEnabled = hasRoleGrant(
    user,
    ['REPORTING_MANAGER', 'SYSTEM_ADMIN'],
    ['direct_reports', 'company'],
  );
  const hrEnabled = hasRoleGrant(
    user,
    ['HR', 'ATTENDANCE_ADMIN', 'SYSTEM_ADMIN'],
    ['company', 'department', 'location'],
  );
  if (!managerEnabled && !hrEnabled) return [];

  const requests = await RegularisationRequest.find({
    status: { $in: ['pending_manager', 'pending_hr'] },
    employeeId: { $ne: user.employeeId },
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
    if (!employee) return [];
    const allowed =
      request.status === 'pending_manager'
        ? managerEnabled && canApproveManagerStep(user, employee)
        : hrEnabled && canApproveHrStep(user, employee);
    return allowed ? [toDto(request, employee)] : [];
  });
}

export async function decideRegularisation(
  user: AuthUser,
  requestId: string,
  input: RegularisationDecisionRequest,
  now = new Date(),
): Promise<RegularisationRequestDto> {
  const request = await RegularisationRequest.findOne({
    _id: requestId,
    status: { $in: ['pending_manager', 'pending_hr'] },
  }).exec();
  if (!request) throw new HttpError(404, 'Pending request not found', 'REQUEST_NOT_FOUND');
  const employee = await Employee.findById(request.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  if (String(employee._id) === user.employeeId) {
    throw new HttpError(403, 'Self approval is not allowed', 'SELF_APPROVAL_FORBIDDEN');
  }

  const step: 1 | 2 = request.status === 'pending_manager' ? 1 : 2;
  const allowed =
    step === 1 ? canApproveManagerStep(user, employee) : canApproveHrStep(user, employee);
  if (!allowed) {
    throw new HttpError(403, 'This request is outside your approval scope', 'SCOPE_FORBIDDEN');
  }

  const approved = input.decision === 'approved';
  const status = approved ? (step === 1 ? 'pending_hr' : 'approved') : 'rejected';
  const update: Record<string, unknown> = {
    $set: { status, currentStep: approved ? (step === 1 ? 2 : 3) : step },
    $push: {
      decisions: {
        step,
        decision: input.decision,
        actorUserId: new Types.ObjectId(user.id),
        actorEmployeeId: new Types.ObjectId(user.employeeId),
        actorDisplayName: user.displayName,
        actorRole: actorRole(user, step),
        comment: input.comment,
        decidedAt: now,
      },
    },
  };
  if (!approved) update.$unset = { deduplicationKey: 1 };

  const updated = await RegularisationRequest.findOneAndUpdate(
    { _id: request._id, status: request.status },
    update,
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!updated) {
    throw new HttpError(409, 'The request was already decided', 'REQUEST_ALREADY_DECIDED');
  }
  await reconcileDailyTimecard(String(employee._id), updated.workDate, now);
  return toDto(updated, employee);
}
