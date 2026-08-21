import { z } from 'zod';

import { LeaveTypeSchema } from './leave.js';

const ObjectIdStringSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid identifier is required');

export const ApprovalEmployeeOptionSchema = z.object({
  id: z.string(),
  employeeCode: z.string(),
  displayName: z.string(),
  email: z.string().email(),
  departmentName: z.string().nullable(),
  hasActiveAccount: z.boolean(),
  canApproveLeave: z.boolean(),
});
export type ApprovalEmployeeOption = z.infer<typeof ApprovalEmployeeOptionSchema>;

export const DepartmentApprovalPolicyDtoSchema = z.object({
  id: z.string(),
  departmentName: z.string(),
  approvalSteps: z.union([z.literal(1), z.literal(2)]),
  approver1: ApprovalEmployeeOptionSchema.nullable(),
  approver2: ApprovalEmployeeOptionSchema.nullable(),
  approver2s: z.array(ApprovalEmployeeOptionSchema),
  importedApprover1Name: z.string().nullable(),
  importedApprover2Name: z.string().nullable(),
  importedApprover2Names: z.array(z.string()),
  emailTriggers: z.array(z.string().email()),
  employeeCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type DepartmentApprovalPolicyDto = z.infer<typeof DepartmentApprovalPolicyDtoSchema>;

export const ApprovalPreferencesDtoSchema = z.object({
  policies: z.array(DepartmentApprovalPolicyDtoSchema),
  employeeOptions: z.array(ApprovalEmployeeOptionSchema),
});
export type ApprovalPreferencesDto = z.infer<typeof ApprovalPreferencesDtoSchema>;

export const UpdateDepartmentApprovalPolicyRequestSchema = z
  .object({
    approvalSteps: z.union([z.literal(1), z.literal(2)]),
    approver1EmployeeId: ObjectIdStringSchema,
    approver2EmployeeIds: z.array(ObjectIdStringSchema).max(10).default([]),
    approver2EmployeeId: ObjectIdStringSchema.nullable().optional(),
    emailTriggers: z.array(z.string().trim().email()).max(25).default([]),
  })
  .superRefine((value, context) => {
    const approver2EmployeeIds = [
      ...new Set(
        value.approver2EmployeeIds.length > 0
          ? value.approver2EmployeeIds
          : value.approver2EmployeeId
            ? [value.approver2EmployeeId]
            : [],
      ),
    ];
    if (value.approvalSteps === 2 && approver2EmployeeIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['approver2EmployeeIds'],
        message: 'At least one second approver is required for a two-stage policy',
      });
    }
    if (approver2EmployeeIds.includes(value.approver1EmployeeId)) {
      context.addIssue({
        code: 'custom',
        path: ['approver2EmployeeIds'],
        message: 'The first approver cannot also be in the second-approval pool',
      });
    }
  });
export type UpdateDepartmentApprovalPolicyRequest = z.infer<
  typeof UpdateDepartmentApprovalPolicyRequestSchema
>;

export const ApprovalRouteImportResponseSchema = z.object({
  fileName: z.string(),
  departmentsUpdated: z.number().int().nonnegative(),
  twoStageDepartments: z.number().int().nonnegative(),
  secondApproversResolved: z.number().int().nonnegative(),
  supportRowsRetainedAsReference: z.number().int().nonnegative(),
  unresolvedApproverNames: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ApprovalRouteImportResponse = z.infer<typeof ApprovalRouteImportResponseSchema>;

export const HolidayScopeTypeSchema = z.enum(['company', 'location']);
export type HolidayScopeType = z.infer<typeof HolidayScopeTypeSchema>;

export const HolidayDtoSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  name: z.string(),
  scopeType: HolidayScopeTypeSchema,
  locationId: z.string().nullable(),
  locationCode: z.string().nullable(),
  locationName: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HolidayDto = z.infer<typeof HolidayDtoSchema>;

export const LocationAdministrationDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.enum(['active', 'inactive']),
  employeeCount: z.number().int().nonnegative(),
  canManagePolicy: z.boolean(),
  canAssignEmployees: z.boolean(),
});
export type LocationAdministrationDto = z.infer<typeof LocationAdministrationDtoSchema>;

export const LocationDirectoryDtoSchema = z.object({
  canCreateLocations: z.boolean(),
  locations: z.array(LocationAdministrationDtoSchema),
});
export type LocationDirectoryDto = z.infer<typeof LocationDirectoryDtoSchema>;

export const CreateLocationRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
});
export type CreateLocationRequest = z.infer<typeof CreateLocationRequestSchema>;

export const EmployeeLocationAdministrationDtoSchema = z.object({
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  locationId: z.string().nullable(),
  locationCode: z.string().nullable(),
  locationName: z.string().nullable(),
  effectiveFrom: z.string().date().nullable(),
});
export type EmployeeLocationAdministrationDto = z.infer<
  typeof EmployeeLocationAdministrationDtoSchema
>;

export const EmployeeLocationQuerySchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((value) => value.toUpperCase()),
});

export const UpdateEmployeeLocationRequestSchema = z.object({
  locationId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .nullable(),
});
export type UpdateEmployeeLocationRequest = z.infer<typeof UpdateEmployeeLocationRequestSchema>;

export const UpsertHolidayRequestSchema = z
  .object({
    date: z.string().date(),
    name: z.string().trim().min(2).max(120),
    scopeType: HolidayScopeTypeSchema.default('company'),
    locationId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .nullable()
      .default(null),
  })
  .superRefine((value, context) => {
    if (value.scopeType === 'company' && value.locationId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['locationId'],
        message: 'A company holiday cannot have a location identifier',
      });
    }
    if (value.scopeType === 'location' && value.locationId === null) {
      context.addIssue({
        code: 'custom',
        path: ['locationId'],
        message: 'A location holiday requires a location identifier',
      });
    }
  });
export type UpsertHolidayRequest = z.infer<typeof UpsertHolidayRequestSchema>;

export const CompanyHolidayRequestSchema = z
  .object({
    date: z.string().date(),
    name: z.string().trim().min(2).max(120),
  })
  .strict();
export type CompanyHolidayRequest = z.infer<typeof CompanyHolidayRequestSchema>;

export const PolicyYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
});

export const LeaveBalanceAdministrationDtoSchema = z.object({
  leaveType: LeaveTypeSchema.exclude(['unpaid']),
  year: z.number().int(),
  entitledDays: z.number().nonnegative(),
  adjustedDays: z.number(),
  pendingDays: z.number().nonnegative(),
  approvedDays: z.number().nonnegative(),
  availableDays: z.number(),
  note: z.string(),
  configured: z.boolean(),
});
export type LeaveBalanceAdministrationDto = z.infer<typeof LeaveBalanceAdministrationDtoSchema>;

export const EmployeeLeaveBalanceAdministrationDtoSchema = z.object({
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  year: z.number().int(),
  balances: z.array(LeaveBalanceAdministrationDtoSchema),
});
export type EmployeeLeaveBalanceAdministrationDto = z.infer<
  typeof EmployeeLeaveBalanceAdministrationDtoSchema
>;

export const EmployeeLeaveBalanceQuerySchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((value) => value.toUpperCase()),
  year: z.coerce.number().int().min(2000).max(2200),
});

export const UpdateLeaveBalanceRequestSchema = z.object({
  leaveType: LeaveTypeSchema.exclude(['unpaid']),
  year: z.number().int().min(2000).max(2200),
  entitledDays: z.number().min(0).max(365),
  adjustedDays: z.number().min(-365).max(365).default(0),
  note: z.string().trim().max(500).default(''),
});
export type UpdateLeaveBalanceRequest = z.infer<typeof UpdateLeaveBalanceRequestSchema>;
