import type { AuthUser } from '@gnomon/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { EmployeeDocument } from '../src/modules/employees/employee.model.js';
import {
  calculateLeaveWindow,
  canApproveLeave,
  leaveDatesEligibleForReconciliation,
} from '../src/modules/leaves/leave.service.js';

const managerEmployeeId = new Types.ObjectId();
const employeeId = new Types.ObjectId();

function manager(scopeIds = [String(employeeId)]): AuthUser {
  return {
    id: String(new Types.ObjectId()),
    employeeId: String(managerEmployeeId),
    employeeCode: 'DDI-MANAGER',
    displayName: 'Leave Manager',
    email: 'leave.manager@example.test',
    permissions: ['leave:approve'],
    scopes: [{ type: 'direct_reports', ids: scopeIds }],
    grants: [
      {
        roleCode: 'REPORTING_MANAGER',
        permissions: ['leave:approve'],
        scope: { type: 'direct_reports', ids: scopeIds },
      },
    ],
  };
}

function employee(overrides: Partial<EmployeeDocument> = {}): EmployeeDocument {
  return {
    _id: employeeId,
    employeeCode: 'DDI-EMPLOYEE',
    firstName: 'Leave',
    lastName: 'Employee',
    email: 'leave.employee@example.test',
    timezone: 'Asia/Kolkata',
    reportingManagerId: managerEmployeeId,
    departmentId: null,
    locationId: null,
    profileSource: 'manual',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('leave working-day calculation', () => {
  it('excludes Saturday and Sunday from a multi-day request', () => {
    expect(
      calculateLeaveWindow({
        leaveType: 'casual',
        startDate: '2026-07-31',
        endDate: '2026-08-04',
        dayPart: 'full_day',
        reason: 'Planned personal leave',
      }),
    ).toEqual({
      workingDates: ['2026-07-31', '2026-08-03', '2026-08-04'],
      requestedDays: 3,
    });
  });

  it('calculates a single working half-day as 0.5', () => {
    expect(
      calculateLeaveWindow({
        leaveType: 'sick',
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        dayPart: 'second_half',
        reason: 'Medical appointment',
      }).requestedDays,
    ).toBe(0.5);
  });

  it('excludes configured holidays from working dates', () => {
    expect(
      calculateLeaveWindow(
        {
          leaveType: 'earned',
          startDate: '2026-08-13',
          endDate: '2026-08-17',
          dayPart: 'full_day',
          reason: 'Planned holiday extension',
        },
        new Set(['2026-08-14']),
      ),
    ).toEqual({ workingDates: ['2026-08-13', '2026-08-17'], requestedDays: 2 });
  });

  it('rejects a weekend-only request', () => {
    expect(() =>
      calculateLeaveWindow({
        leaveType: 'unpaid',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        dayPart: 'full_day',
        reason: 'Weekend request',
      }),
    ).toThrow('no working days');
  });

  it('does not reconcile future dates during approval', () => {
    expect(
      leaveDatesEligibleForReconciliation(
        ['2026-07-24', '2026-07-27', '2026-07-28'],
        new Date('2026-07-27T12:00:00.000Z'),
      ),
    ).toEqual(['2026-07-24', '2026-07-27']);
  });
});

describe('leave approval scope', () => {
  it('allows only the assigned scoped Reporting Manager', () => {
    expect(canApproveLeave(manager(), employee())).toBe(true);
    expect(canApproveLeave(manager([]), employee())).toBe(true);
    expect(canApproveLeave(manager([String(new Types.ObjectId())]), employee())).toBe(false);
    expect(canApproveLeave(manager(), employee({ reportingManagerId: new Types.ObjectId() }))).toBe(
      false,
    );
  });

  it('forbids self approval', () => {
    expect(canApproveLeave(manager(), employee({ _id: managerEmployeeId }))).toBe(false);
  });
});
