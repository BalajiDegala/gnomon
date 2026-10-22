import { z } from 'zod';

const ObjectIdStringSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid identifier is required');

export const EmployeeStatusSchema = z.enum(['active', 'inactive']);
export type EmployeeStatus = z.infer<typeof EmployeeStatusSchema>;

export const EmployeeDirectoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: EmployeeStatusSchema.optional(),
});

export const EmployeeReferenceDtoSchema = z.object({
  id: z.string(),
  employeeCode: z.string(),
  displayName: z.string(),
});
export type EmployeeReferenceDto = z.infer<typeof EmployeeReferenceDtoSchema>;

export const EmployeeAttendanceIdentityDtoSchema = z.object({
  source: z.literal('door_workbook'),
  personnelId: z.string(),
  cardNumber: z.string().nullable(),
  departmentName: z.string().nullable(),
  lastSeenAt: z.string().datetime(),
});
export type EmployeeAttendanceIdentityDto = z.infer<typeof EmployeeAttendanceIdentityDtoSchema>;

export const EmployeeHrProfileDtoSchema = z.object({
  source: z.literal('users_csv'),
  userId: z.string(),
  mailId: z.string().email(),
  fullName: z.string(),
  designation: z.string(),
  departmentName: z.string(),
  leaveApprover1Name: z.string().nullable(),
  leaveApprover2Name: z.string().nullable(),
  approver1EmployeeId: z.string().nullable(),
  approver2EmployeeId: z.string().nullable(),
  emailTriggers: z.array(z.string().email()),
  importedAt: z.string().datetime(),
});
export type EmployeeHrProfileDto = z.infer<typeof EmployeeHrProfileDtoSchema>;

export const EmployeeBiometricProfileDtoSchema = z.object({
  fullName: z.string(),
  departmentName: z.string().nullable(),
  designation: z.string().nullable(),
  companyName: z.string().nullable(),
  importedAt: z.string().datetime(),
});

export const EmployeeDirectoryItemDtoSchema = z.object({
  id: z.string(),
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  timezone: z.string(),
  status: EmployeeStatusSchema,
  profileSource: z.enum(['users_csv', 'door_workbook', 'biometric_csv', 'manual', 'system']),
  biometricProfile: EmployeeBiometricProfileDtoSchema.nullable().optional(),
  hrProfile: EmployeeHrProfileDtoSchema.nullable(),
  attendanceIdentity: EmployeeAttendanceIdentityDtoSchema.nullable(),
  reportingManager: EmployeeReferenceDtoSchema.nullable(),
  location: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .nullable(),
  updatedAt: z.string().datetime(),
});
export type EmployeeDirectoryItemDto = z.infer<typeof EmployeeDirectoryItemDtoSchema>;

export const EmployeeDirectoryDtoSchema = z.object({
  employees: z.array(EmployeeDirectoryItemDtoSchema),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
});
export type EmployeeDirectoryDto = z.infer<typeof EmployeeDirectoryDtoSchema>;

export const UserDirectoryImportErrorSchema = z.object({
  rowNumber: z.number().int().positive(),
  employeeId: z.string(),
  reason: z.string(),
});
export type UserDirectoryImportError = z.infer<typeof UserDirectoryImportErrorSchema>;

export const UserDirectoryImportResponseSchema = z.object({
  fileName: z.string(),
  totalRows: z.number().int().nonnegative(),
  importedRows: z.number().int().nonnegative(),
  createdEmployees: z.number().int().nonnegative(),
  updatedEmployees: z.number().int().nonnegative(),
  attendanceIdentitiesLinked: z.number().int().nonnegative(),
  usersWithoutAttendanceIdentity: z.number().int().nonnegative(),
  archivedDoorProfiles: z.number().int().nonnegative(),
  unresolvedApproverNames: z.array(z.string()),
  errors: z.array(UserDirectoryImportErrorSchema),
});
export type UserDirectoryImportResponse = z.infer<typeof UserDirectoryImportResponseSchema>;

export const CreateEmployeeRequestSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  timezone: z.string().trim().min(3).max(80).default('Asia/Kolkata'),
  reportingManagerId: ObjectIdStringSchema.nullable().default(null),
});
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;

export const UpdateEmployeeRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase())
      .optional(),
    timezone: z.string().trim().min(3).max(80).optional(),
    reportingManagerId: ObjectIdStringSchema.nullable().optional(),
    status: EmployeeStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one employee field is required',
  });
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequestSchema>;
