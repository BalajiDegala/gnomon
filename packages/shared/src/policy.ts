import { z } from 'zod';

import { LeaveTypeSchema } from './leave.js';

export const HolidayScopeTypeSchema = z.enum(['company', 'location']);
export type HolidayScopeType = z.infer<typeof HolidayScopeTypeSchema>;

export const HolidayDtoSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  name: z.string(),
  scopeType: HolidayScopeTypeSchema,
  locationId: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HolidayDto = z.infer<typeof HolidayDtoSchema>;

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
