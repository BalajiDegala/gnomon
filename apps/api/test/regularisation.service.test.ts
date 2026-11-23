import type { AuthUser } from '@gnomon/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { EmployeeDocument } from '../src/modules/employees/employee.model.js';
import {
  canApproveHrStep,
  canApproveManagerStep,
  validateCorrectionWindow,
} from '../src/modules/regularisations/regularisation.service.js';

const managerEmployeeId = new Types.ObjectId();
const targetEmployeeId = new Types.ObjectId();
const departmentId = new Types.ObjectId();

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new Types.ObjectId()),
    employeeId: String(managerEmployeeId),
    employeeCode: 'DDI-MANAGER',
    displayName: 'Reporting Manager',
    email: 'manager@example.test',
    permissions: ['regularisation:approve'],
    scopes: [],
    grants: [],
    ...overrides,
  };
}

function employee(overrides: Partial<EmployeeDocument> = {}): EmployeeDocument {
  return {
    _id: targetEmployeeId,
    employeeCode: 'DDI-EMPLOYEE',
    firstName: 'Test',
    lastName: 'Employee',
    email: 'employee@example.test',
    timezone: 'Asia/Kolkata',
    reportingManagerId: managerEmployeeId,
    departmentId,
    locationId: null,
    profileSource: 'manual',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('regularisation approval scope', () => {
  it('allows a Reporting Manager only for an actual scoped direct report', () => {
    const manager = user({
      grants: [
        {
          roleCode: 'REPORTING_MANAGER',
          permissions: ['regularisation:approve'],
          scope: { type: 'direct_reports', ids: [String(targetEmployeeId)] },
        },
      ],
    });

    expect(canApproveManagerStep(manager, employee())).toBe(true);
    expect(
      canApproveManagerStep(manager, employee({ reportingManagerId: new Types.ObjectId() })),
    ).toBe(false);
    expect(
      canApproveManagerStep(
        user({
          grants: [
            {
              roleCode: 'REPORTING_MANAGER',
              permissions: ['regularisation:approve'],
              scope: { type: 'direct_reports', ids: [String(new Types.ObjectId())] },
            },
          ],
        }),
        employee(),
      ),
    ).toBe(false);
  });

  it('allows HR only inside the granted department and forbids self approval', () => {
    const hr = user({
      employeeId: String(new Types.ObjectId()),
      grants: [
        {
          roleCode: 'HR',
          permissions: ['regularisation:approve'],
          scope: { type: 'department', ids: [String(departmentId)] },
        },
      ],
    });

    expect(canApproveHrStep(hr, employee())).toBe(true);
    expect(canApproveHrStep(hr, employee({ departmentId: new Types.ObjectId() }))).toBe(false);
    expect(canApproveHrStep(user({ employeeId: String(targetEmployeeId) }), employee())).toBe(
      false,
    );
  });
});

describe('regularisation correction window', () => {
  it('accepts a cross-midnight correction inside one closed workday', () => {
    expect(
      validateCorrectionWindow(
        {
          workDate: '2026-07-24',
          source: 'biometric',
          missingEvent: 'closing',
          requestedStart: '2026-07-24T14:30:00.000Z',
          requestedEnd: '2026-07-24T23:30:00.000Z',
          reason: 'Biometric exit was not captured at the end of the shift.',
        },
        new Date('2026-07-25T02:00:00.000Z'),
      ).duration,
    ).toBe(540);
  });

  it('rejects a request while the workday remains open', () => {
    expect(() =>
      validateCorrectionWindow(
        {
          workDate: '2026-07-24',
          source: 'website',
          missingEvent: 'both',
          requestedStart: '2026-07-24T03:30:00.000Z',
          requestedEnd: '2026-07-24T12:30:00.000Z',
          reason: 'The website session was not recorded during the shift.',
        },
        new Date('2026-07-24T12:45:00.000Z'),
      ),
    ).toThrow('workday window closes');
  });
});
