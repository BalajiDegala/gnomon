import type { AuthUser } from '@gnomon/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  listSecurityDirectory,
  updateEmployeeAccount,
} from '../src/modules/roles/security.service.js';

function user(roleCode: 'EMPLOYEE' | 'SYSTEM_ADMIN', scopeType: 'self' | 'company'): AuthUser {
  const permission = roleCode === 'SYSTEM_ADMIN' ? 'audit:read' : 'attendance:self:read';
  const userId = String(new Types.ObjectId());
  return {
    id: userId,
    employeeId: String(new Types.ObjectId()),
    employeeCode: 'SEC001',
    displayName: 'Security Test',
    email: 'security@example.test',
    permissions: [permission],
    scopes: [{ type: scopeType, ids: [] }],
    grants: [
      {
        roleCode,
        permissions: [permission],
        scope: { type: scopeType, ids: [] },
      },
    ],
  };
}

describe('security administration guardrails', () => {
  it('rejects users without company System Administrator scope before reading data', async () => {
    await expect(listSecurityDirectory(user('EMPLOYEE', 'self'))).rejects.toMatchObject({
      status: 403,
      code: 'SECURITY_ADMIN_REQUIRED',
    });
  });

  it('prevents an administrator from disabling their own account', async () => {
    const administrator = user('SYSTEM_ADMIN', 'company');
    await expect(
      updateEmployeeAccount(administrator, administrator.id, { status: 'inactive' }),
    ).rejects.toMatchObject({ status: 409, code: 'SELF_LOCKOUT' });
  });
});
