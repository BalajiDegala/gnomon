import { z } from 'zod';

import { RoleCodeSchema, ScopeTypeSchema } from './authorization.js';
import {
  EmployeeAttendanceIdentityDtoSchema,
  EmployeeHrProfileDtoSchema,
  EmployeeBiometricProfileDtoSchema,
} from './employee.js';

const ObjectIdStringSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid identifier is required');

export const SecurityRoleDtoSchema = z.object({
  id: z.string(),
  code: RoleCodeSchema,
  name: z.string(),
  permissions: z.array(z.string()),
});
export type SecurityRoleDto = z.infer<typeof SecurityRoleDtoSchema>;

export const SecurityRoleAssignmentDtoSchema = z.object({
  id: z.string(),
  roleCode: RoleCodeSchema,
  roleName: z.string(),
  scopeType: ScopeTypeSchema,
  scopeIds: z.array(z.string()),
  validFrom: z.string().datetime(),
});
export type SecurityRoleAssignmentDto = z.infer<typeof SecurityRoleAssignmentDtoSchema>;

export const SecurityEmployeeAccessDtoSchema = z.object({
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  employeeEmail: z.string().email(),
  employeeStatus: z.enum(['active', 'inactive']),
  profileSource: z.enum(['users_csv', 'door_workbook', 'biometric_csv', 'manual', 'system']),
  biometricProfile: EmployeeBiometricProfileDtoSchema.nullable().optional(),
  hrProfile: EmployeeHrProfileDtoSchema.nullable(),
  attendanceIdentity: EmployeeAttendanceIdentityDtoSchema.nullable(),
  account: z
    .object({
      userId: z.string(),
      email: z.string().email(),
      status: z.enum(['active', 'locked', 'inactive']),
      lastLoginAt: z.string().datetime().nullable(),
      assignments: z.array(SecurityRoleAssignmentDtoSchema),
    })
    .nullable(),
});
export type SecurityEmployeeAccessDto = z.infer<typeof SecurityEmployeeAccessDtoSchema>;

const SecurityScopeOptionSchema = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const SecurityDirectoryDtoSchema = z.object({
  employees: z.array(SecurityEmployeeAccessDtoSchema),
  roles: z.array(SecurityRoleDtoSchema),
  scopeOptions: z.object({
    shows: z.array(SecurityScopeOptionSchema),
    locations: z.array(SecurityScopeOptionSchema),
  }),
});
export type SecurityDirectoryDto = z.infer<typeof SecurityDirectoryDtoSchema>;

export const ProvisionEmployeeAccountRequestSchema = z.object({
  employeeId: ObjectIdStringSchema,
  temporaryPassword: z.string().min(12).max(128),
});
export type ProvisionEmployeeAccountRequest = z.infer<typeof ProvisionEmployeeAccountRequestSchema>;

export const AssignSecurityRoleRequestSchema = z.object({
  roleCode: RoleCodeSchema,
  scopeType: ScopeTypeSchema,
  scopeIds: z.array(ObjectIdStringSchema).max(100).default([]),
});
export type AssignSecurityRoleRequest = z.infer<typeof AssignSecurityRoleRequestSchema>;

export const UpdateEmployeeAccountRequestSchema = z
  .object({
    status: z.enum(['active', 'locked', 'inactive']).optional(),
    temporaryPassword: z.string().min(12).max(128).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'An account status or temporary password is required',
  });
export type UpdateEmployeeAccountRequest = z.infer<typeof UpdateEmployeeAccountRequestSchema>;
