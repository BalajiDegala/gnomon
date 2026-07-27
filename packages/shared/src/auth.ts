import { z } from 'zod';

import { PermissionCodeSchema, RoleCodeSchema, ScopeTypeSchema } from './authorization.js';

export const LoginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthorizationGrantSchema = z.object({
  roleCode: RoleCodeSchema,
  permissions: z.array(PermissionCodeSchema),
  scope: z.object({
    type: ScopeTypeSchema,
    ids: z.array(z.string()),
  }),
});
export type AuthorizationGrant = z.infer<typeof AuthorizationGrantSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  permissions: z.array(PermissionCodeSchema),
  scopes: z.array(
    z.object({
      type: z.string(),
      ids: z.array(z.string()),
    }),
  ),
  grants: z.array(AuthorizationGrantSchema),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
