import { z } from 'zod';

export const permissionCodes = [
  'employee:read',
  'employee:update',
  'attendance:self:read',
  'attendance:self:write',
  'attendance:team:read',
  'attendance:all:read',
  'regularisation:create',
  'regularisation:approve',
  'leave:create',
  'leave:approve',
  'timesheet:create',
  'show:manage',
  'imports:create',
  'policy:manage',
  'audit:read',
] as const;

export const PermissionCodeSchema = z.enum(permissionCodes);
export type PermissionCode = z.infer<typeof PermissionCodeSchema>;

export const roleCodes = [
  'EMPLOYEE',
  'REPORTING_MANAGER',
  'SHOW_MANAGER',
  'HR',
  'ATTENDANCE_ADMIN',
  'SYSTEM_ADMIN',
] as const;

export const RoleCodeSchema = z.enum(roleCodes);
export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const scopeTypes = [
  'self',
  'direct_reports',
  'show',
  'department',
  'location',
  'company',
] as const;

export const ScopeTypeSchema = z.enum(scopeTypes);
export type ScopeType = z.infer<typeof ScopeTypeSchema>;

export interface AuthorizationScope {
  type: ScopeType;
  ids: string[];
}
