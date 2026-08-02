import { describe, expect, it } from 'vitest';

import { systemRolePermissions } from '../src/modules/roles/system-roles.js';

describe('system role permissions', () => {
  it('allows employees to read and update only their own attendance', () => {
    expect(systemRolePermissions.EMPLOYEE).toContain('attendance:self:read');
    expect(systemRolePermissions.EMPLOYEE).toContain('attendance:self:write');
    expect(systemRolePermissions.EMPLOYEE).not.toContain('attendance:all:read');
  });

  it('limits show managers to show administration', () => {
    expect(systemRolePermissions.SHOW_MANAGER).toEqual(['show:manage']);
    expect(systemRolePermissions.SHOW_MANAGER).not.toContain('attendance:all:read');
    expect(systemRolePermissions.HR).toContain('attendance:all:read');
  });
});
