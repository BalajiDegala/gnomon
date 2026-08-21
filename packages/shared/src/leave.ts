import { z } from 'zod';

export const LeaveTypeSchema = z.enum(['casual', 'sick', 'earned', 'unpaid']);
export type LeaveType = z.infer<typeof LeaveTypeSchema>;

export const LeaveDayPartSchema = z.enum(['full_day', 'first_half', 'second_half']);
export type LeaveDayPart = z.infer<typeof LeaveDayPartSchema>;

export const LeaveStatusSchema = z.enum([
  'pending_manager',
  'pending_hr',
  'approved',
  'rejected',
  'cancelled',
]);
export type LeaveStatus = z.infer<typeof LeaveStatusSchema>;

export const LeaveDecisionSchema = z.object({
  step: z.number().int().min(1).max(2),
  decision: z.enum(['approved', 'rejected']),
  actorDisplayName: z.string(),
  actorRole: z.enum(['reporting_manager', 'department_approver', 'system_admin']),
  comment: z.string(),
  decidedAt: z.string().datetime(),
});
export type LeaveDecision = z.infer<typeof LeaveDecisionSchema>;

export const LeaveRequestDtoSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  leaveType: LeaveTypeSchema,
  startDate: z.string().date(),
  endDate: z.string().date(),
  dayPart: LeaveDayPartSchema,
  requestedDays: z.number().positive(),
  workingDates: z.array(z.string().date()),
  reason: z.string(),
  status: LeaveStatusSchema,
  approvalSteps: z.union([z.literal(1), z.literal(2)]),
  currentStep: z.number().int().min(1).max(3),
  approver1DisplayName: z.string(),
  approver2DisplayName: z.string().nullable(),
  approver2DisplayNames: z.array(z.string()),
  approvalPolicyVersion: z.string(),
  decision: LeaveDecisionSchema.nullable(),
  decisions: z.array(LeaveDecisionSchema),
  submittedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LeaveRequestDto = z.infer<typeof LeaveRequestDtoSchema>;

export const LeaveApprovalRoutePreviewDtoSchema = z.object({
  approvalSteps: z.union([z.literal(1), z.literal(2)]),
  approver1DisplayName: z.string().nullable(),
  approver2DisplayNames: z.array(z.string()),
});
export type LeaveApprovalRoutePreviewDto = z.infer<typeof LeaveApprovalRoutePreviewDtoSchema>;

export const LeaveBalanceDtoSchema = z.object({
  leaveType: LeaveTypeSchema,
  year: z.number().int(),
  entitledDays: z.number().nonnegative().nullable(),
  adjustedDays: z.number().nullable(),
  pendingDays: z.number().nonnegative(),
  approvedDays: z.number().nonnegative(),
  availableDays: z.number().nullable(),
  balanceTracked: z.boolean(),
});
export type LeaveBalanceDto = z.infer<typeof LeaveBalanceDtoSchema>;

export const CreateLeaveRequestSchema = z
  .object({
    leaveType: LeaveTypeSchema,
    startDate: z.string().date(),
    endDate: z.string().date(),
    dayPart: LeaveDayPartSchema.default('full_day'),
    reason: z.string().trim().min(5).max(1_000),
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'End date must be on or after start date',
      });
    }
    if (value.startDate.slice(0, 4) !== value.endDate.slice(0, 4)) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'A leave request must stay inside one calendar year',
      });
    }
    if (value.dayPart !== 'full_day' && value.startDate !== value.endDate) {
      context.addIssue({
        code: 'custom',
        path: ['dayPart'],
        message: 'Half-day leave is available only for a single date',
      });
    }
  });
export type CreateLeaveRequest = z.infer<typeof CreateLeaveRequestSchema>;

export const LeaveDecisionRequestSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().max(1_000).default(''),
  })
  .refine((value) => value.decision === 'approved' || value.comment.length >= 3, {
    path: ['comment'],
    message: 'A rejection reason is required',
  });
export type LeaveDecisionRequest = z.infer<typeof LeaveDecisionRequestSchema>;

export const LeaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
});
