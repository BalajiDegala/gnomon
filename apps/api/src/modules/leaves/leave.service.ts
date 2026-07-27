import {
  getWorkDate,
  type AuthUser,
  type CreateLeaveRequest,
  type LeaveBalanceDto,
  type LeaveDecisionRequest,
  type LeaveRequestDto,
  type LeaveType,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import { listApplicableHolidays } from '../policies/policy.service.js';
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

function employeeName(employee: Pick<EmployeeDocument, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
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
  employee: Pick<EmployeeDocument, '_id' | 'employeeCode' | 'firstName' | 'lastName'>,
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
    approvalPolicyVersion: request.approvalPolicyVersion,
    decision: request.decision
      ? {
          decision: request.decision.decision,
          actorDisplayName: request.decision.actorDisplayName,
          actorRole: request.decision.actorRole,
          comment: request.decision.comment,
          decidedAt: request.decision.decidedAt.toISOString(),
        }
      : null,
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
      status: { $in: ['pending_manager', 'approved'] },
    })
      .select({ leaveType: 1, requestedDays: 1, status: 1 })
      .lean()
      .exec(),
  ]);
  const configuredByType = new Map(configured.map((balance) => [balance.leaveType, balance]));

  return leaveTypes.map((leaveType) => {
    const balance = leaveType === 'unpaid' ? undefined : configuredByType.get(leaveType);
    const pendingDays = requests
      .filter((request) => request.leaveType === leaveType && request.status === 'pending_manager')
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
  const [balances, holidays] = await Promise.all([
    buildBalances(user.employeeId, selectedYear),
    listApplicableHolidays(user.employeeId, `${selectedYear}-01-01`, `${selectedYear}-12-31`),
  ]);
  return {
    requests: requests.map((request) => toDto(request, employee)),
    balances,
    holidays,
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
  if (!employee.reportingManagerId) {
    throw new HttpError(
      409,
      'A Reporting Manager must be assigned before leave can be submitted',
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
      managerEmployeeId: employee.reportingManagerId,
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
      approvalPolicyVersion: APPROVAL_POLICY_VERSION,
      decision: null,
      submittedAt: now,
    });
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
    { _id: requestId, employeeId: user.employeeId, status: 'pending_manager' },
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
  const employee = await Employee.findById(user.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  return toDto(request, employee);
}

export async function listLeaveApprovals(user: AuthUser): Promise<LeaveRequestDto[]> {
  await ensureIndexes();
  const requests = await LeaveRequest.find({
    status: 'pending_manager',
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
    return employee && canApproveLeave(user, employee) ? [toDto(request, employee)] : [];
  });
}

export async function decideLeave(
  user: AuthUser,
  requestId: string,
  input: LeaveDecisionRequest,
  now = new Date(),
): Promise<LeaveRequestDto> {
  const request = await LeaveRequest.findOne({ _id: requestId, status: 'pending_manager' }).exec();
  if (!request) throw new HttpError(404, 'Pending leave request not found', 'REQUEST_NOT_FOUND');
  const employee = await Employee.findById(request.employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  if (!canApproveLeave(user, employee)) {
    throw new HttpError(
      403,
      'This leave request is outside your approval scope',
      'SCOPE_FORBIDDEN',
    );
  }

  const approved = input.decision === 'approved';
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending_manager' },
    {
      $set: {
        status: approved ? 'approved' : 'rejected',
        reservationActive: approved,
        ...(approved ? {} : { reservedDates: [] }),
        decision: {
          decision: input.decision,
          actorUserId: new Types.ObjectId(user.id),
          actorEmployeeId: new Types.ObjectId(user.employeeId),
          actorDisplayName: user.displayName,
          actorRole: user.grants.some((grant) => grant.roleCode === 'REPORTING_MANAGER')
            ? 'reporting_manager'
            : 'system_admin',
          comment: input.comment,
          decidedAt: now,
        },
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).exec();
  if (!updated)
    throw new HttpError(409, 'The request was already decided', 'REQUEST_ALREADY_DECIDED');

  if (approved) {
    await Promise.all(
      leaveDatesEligibleForReconciliation(updated.workingDates, now).map((workDate) =>
        reconcileDailyTimecard(String(updated.employeeId), workDate, now),
      ),
    );
  }
  return toDto(updated, employee);
}
