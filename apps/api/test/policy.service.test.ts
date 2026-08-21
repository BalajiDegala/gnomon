import type { AuthUser } from '@gnomon/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { EmployeeDocument } from '../src/modules/employees/employee.model.js';
import {
  canAssignEmployeeLocation,
  canManageEmployeeBalance,
  canManageHoliday,
} from '../src/modules/policies/policy.service.js';

const administratorEmployeeId = new Types.ObjectId();
const targetEmployeeId = new Types.ObjectId();
const departmentId = new Types.ObjectId();
const locationId = new Types.ObjectId();

function user(grants: AuthUser['grants']): AuthUser {
  return {
    id: String(new Types.ObjectId()),
    employeeId: String(administratorEmployeeId),
    employeeCode: 'ADMIN01',
    displayName: 'Policy Administrator',
    email: 'policy.admin@example.test',
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
    scopes: grants.map((grant) => grant.scope),
    grants,
  };
}

function employee(): EmployeeDocument {
  return {
    _id: targetEmployeeId,
    employeeCode: 'EMP001',
    firstName: 'Target',
    lastName: 'Employee',
    email: 'target.employee@example.test',
    timezone: 'Asia/Kolkata',
    reportingManagerId: null,
    departmentId,
    locationId,
    profileSource: 'manual',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('holiday policy scope', () => {
  it('allows company policy grants across holiday scopes', () => {
    const administrator = user([
      {
        roleCode: 'ATTENDANCE_ADMIN',
        permissions: ['policy:manage'],
        scope: { type: 'company', ids: [] },
      },
    ]);

    expect(canManageHoliday(administrator, { scopeType: 'company', locationId: null })).toBe(true);
    expect(canManageHoliday(administrator, { scopeType: 'location', locationId })).toBe(true);
  });

  it('keeps a location policy grant inside its assigned location', () => {
    const administrator = user([
      {
        roleCode: 'ATTENDANCE_ADMIN',
        permissions: ['policy:manage'],
        scope: { type: 'location', ids: [String(locationId)] },
      },
    ]);

    expect(canManageHoliday(administrator, { scopeType: 'location', locationId })).toBe(true);
    expect(
      canManageHoliday(administrator, {
        scopeType: 'location',
        locationId: new Types.ObjectId(),
      }),
    ).toBe(false);
    expect(canManageHoliday(administrator, { scopeType: 'company', locationId: null })).toBe(false);
  });
});

describe('leave balance scope', () => {
  it('allows HR company and matching department grants', () => {
    expect(
      canManageEmployeeBalance(
        user([
          {
            roleCode: 'HR',
            permissions: ['employee:update'],
            scope: { type: 'company', ids: [] },
          },
        ]),
        employee(),
      ),
    ).toBe(true);
    expect(
      canManageEmployeeBalance(
        user([
          {
            roleCode: 'HR',
            permissions: ['employee:update'],
            scope: { type: 'department', ids: [String(departmentId)] },
          },
        ]),
        employee(),
      ),
    ).toBe(true);
  });

  it('rejects the wrong location and non-HR employee update grants', () => {
    expect(
      canManageEmployeeBalance(
        user([
          {
            roleCode: 'HR',
            permissions: ['employee:update'],
            scope: { type: 'location', ids: [String(new Types.ObjectId())] },
          },
        ]),
        employee(),
      ),
    ).toBe(false);
    expect(
      canManageEmployeeBalance(
        user([
          {
            roleCode: 'REPORTING_MANAGER',
            permissions: ['employee:update'],
            scope: { type: 'company', ids: [] },
          },
        ]),
        employee(),
      ),
    ).toBe(false);
  });
});

describe('employee location assignment scope', () => {
  it('allows company HR and same-location HR assignments', () => {
    const target = employee();
    expect(
      canAssignEmployeeLocation(
        user([
          {
            roleCode: 'HR',
            permissions: ['employee:update'],
            scope: { type: 'company', ids: [] },
          },
        ]),
        target,
        new Types.ObjectId(),
      ),
    ).toBe(true);
    expect(
      canAssignEmployeeLocation(
        user([
          {
            roleCode: 'HR',
            permissions: ['employee:update'],
            scope: { type: 'location', ids: [String(locationId)] },
          },
        ]),
        target,
        locationId,
      ),
    ).toBe(true);
  });

  it('blocks cross-location, department-only, and unassigned location-scoped changes', () => {
    const scopedHr = user([
      {
        roleCode: 'HR',
        permissions: ['employee:update'],
        scope: { type: 'location', ids: [String(locationId)] },
      },
    ]);
    expect(canAssignEmployeeLocation(scopedHr, employee(), new Types.ObjectId())).toBe(false);
    expect(
      canAssignEmployeeLocation(
        user([
          {
            roleCode: 'HR',
            permissions: ['employee:update'],
            scope: { type: 'department', ids: [String(departmentId)] },
          },
        ]),
        employee(),
        locationId,
      ),
    ).toBe(false);
    expect(canAssignEmployeeLocation(scopedHr, { locationId: null }, locationId)).toBe(false);
  });
});
