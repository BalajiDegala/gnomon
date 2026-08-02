import { permissionCodes, roleCodes, type PermissionCode, type RoleCode } from '@gnomon/shared';

import { Role } from './role.model.js';

const roleNames: Record<RoleCode, string> = {
  EMPLOYEE: 'Employee',
  REPORTING_MANAGER: 'Reporting Manager',
  SHOW_MANAGER: 'Show Manager',
  HR: 'Human Resources',
  ATTENDANCE_ADMIN: 'Attendance Administrator',
  SYSTEM_ADMIN: 'System Administrator',
};

export const systemRolePermissions: Record<RoleCode, PermissionCode[]> = {
  EMPLOYEE: [
    'attendance:self:read',
    'attendance:self:write',
    'regularisation:create',
    'leave:create',
    'timesheet:create',
  ],
  REPORTING_MANAGER: [
    'employee:read',
    'attendance:team:read',
    'regularisation:approve',
    'leave:approve',
  ],
  SHOW_MANAGER: ['show:manage'],
  HR: [
    'employee:read',
    'employee:update',
    'attendance:all:read',
    'regularisation:approve',
    'leave:approve',
    'audit:read',
  ],
  ATTENDANCE_ADMIN: [
    'attendance:all:read',
    'regularisation:approve',
    'imports:create',
    'policy:manage',
    'audit:read',
  ],
  SYSTEM_ADMIN: [...permissionCodes],
};

export async function ensureSystemRoles() {
  const roles = await Promise.all(
    roleCodes.map((code) =>
      Role.findOneAndUpdate(
        { code },
        {
          $set: {
            name: roleNames[code],
            permissions: systemRolePermissions[code],
            isSystem: true,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ),
    ),
  );

  return new Map(roles.map((role) => [role.code, role]));
}
