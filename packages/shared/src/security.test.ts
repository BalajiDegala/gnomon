import { describe, expect, it } from 'vitest';

import {
  AssignSecurityRoleRequestSchema,
  ProvisionEmployeeAccountRequestSchema,
} from './security.js';

describe('security administration contracts', () => {
  it('requires a strong temporary password when provisioning an account', () => {
    const employeeId = '507f1f77bcf86cd799439011';
    expect(
      ProvisionEmployeeAccountRequestSchema.safeParse({ employeeId, temporaryPassword: 'short' })
        .success,
    ).toBe(false);
    expect(
      ProvisionEmployeeAccountRequestSchema.safeParse({
        employeeId,
        temporaryPassword: 'temporary-password-123',
      }).success,
    ).toBe(true);
  });

  it('validates role and scope identifiers', () => {
    expect(
      AssignSecurityRoleRequestSchema.safeParse({
        roleCode: 'SHOW_MANAGER',
        scopeType: 'show',
        scopeIds: ['507f1f77bcf86cd799439011'],
      }).success,
    ).toBe(true);
    expect(
      AssignSecurityRoleRequestSchema.safeParse({
        roleCode: 'UNKNOWN',
        scopeType: 'show',
        scopeIds: [],
      }).success,
    ).toBe(false);
  });
});
