import type { AuthUser } from '@gnomon/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  buildEmployeeScopeFilter,
  hasCompanyEmployeePermission,
} from '../src/modules/employees/employee-scope.service.js';

const employeeId = new Types.ObjectId();

function user(grants: AuthUser['grants']): AuthUser {
  return {
    id: String(new Types.ObjectId()),
    employeeId: String(employeeId),
    employeeCode: 'MGR001',
    displayName: 'Manager One',
    email: 'manager@example.test',
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
    scopes: grants.map((grant) => grant.scope),
    grants,
  };
}

describe('employee scope resolution', () => {
  it('resolves company access without an employee filter', async () => {
    const administrator = user([
      {
        roleCode: 'HR',
        permissions: ['employee:read', 'employee:update'],
        scope: { type: 'company', ids: [] },
      },
    ]);

    await expect(buildEmployeeScopeFilter(administrator, ['employee:read'])).resolves.toEqual({});
    expect(hasCompanyEmployeePermission(administrator, 'employee:update')).toBe(true);
  });

  it('limits a reporting manager to actual direct reports', async () => {
    const manager = user([
      {
        roleCode: 'REPORTING_MANAGER',
        permissions: ['employee:read'],
        scope: { type: 'direct_reports', ids: [] },
      },
    ]);

    const filter = await buildEmployeeScopeFilter(manager, ['employee:read']);
    expect(String(filter.reportingManagerId)).toBe(String(employeeId));
  });

  it('rejects a permission that is not granted', async () => {
    const employee = user([
      {
        roleCode: 'EMPLOYEE',
        permissions: ['attendance:self:read'],
        scope: { type: 'self', ids: [] },
      },
    ]);

    await expect(buildEmployeeScopeFilter(employee, ['employee:read'])).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
