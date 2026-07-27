import { z } from 'zod';

const ObjectIdStringSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid identifier is required');

export const ShowStatusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);
export type ShowStatus = z.infer<typeof ShowStatusSchema>;

export const TaskStatusSchema = z.enum(['active', 'inactive']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TimeEntryStatusSchema = z.enum(['draft', 'submitted', 'approved', 'rejected']);
export type TimeEntryStatus = z.infer<typeof TimeEntryStatusSchema>;

export const TimesheetDecisionActorRoleSchema = z.enum([
  'reporting_manager',
  'show_manager',
  'system_admin',
]);
export type TimesheetDecisionActorRole = z.infer<typeof TimesheetDecisionActorRoleSchema>;

export const TimesheetDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  actorDisplayName: z.string(),
  actorRole: TimesheetDecisionActorRoleSchema,
  comment: z.string(),
  decidedAt: z.string().datetime(),
});
export type TimesheetDecision = z.infer<typeof TimesheetDecisionSchema>;

export const TimeEntryApprovalSchema = z.object({
  policyVersion: z.string(),
  submittedAt: z.string().datetime().nullable(),
  decisions: z.array(TimesheetDecisionSchema),
});
export type TimeEntryApproval = z.infer<typeof TimeEntryApprovalSchema>;

export const TaskDtoSchema = z.object({
  id: z.string(),
  showId: z.string(),
  code: z.string(),
  name: z.string(),
  status: TaskStatusSchema,
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;

export const ShowAssignmentDtoSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  displayName: z.string(),
  status: z.enum(['active', 'inactive']),
});
export type ShowAssignmentDto = z.infer<typeof ShowAssignmentDtoSchema>;

export const ShowAdminDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: ShowStatusSchema,
  tasks: z.array(TaskDtoSchema),
  assignments: z.array(ShowAssignmentDtoSchema),
});
export type ShowAdminDto = z.infer<typeof ShowAdminDtoSchema>;

export const TimesheetOptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  tasks: z.array(TaskDtoSchema),
});
export type TimesheetOption = z.infer<typeof TimesheetOptionSchema>;

export const TimeEntryDtoSchema = z.object({
  id: z.string(),
  workDate: z.string().date(),
  showId: z.string(),
  showCode: z.string(),
  showName: z.string(),
  taskId: z.string(),
  taskCode: z.string(),
  taskName: z.string(),
  workSessionId: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  description: z.string(),
  billable: z.boolean(),
  status: TimeEntryStatusSchema,
  approval: TimeEntryApprovalSchema,
});
export type TimeEntryDto = z.infer<typeof TimeEntryDtoSchema>;

export const TimesheetApprovalDtoSchema = TimeEntryDtoSchema.extend({
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
});
export type TimesheetApprovalDto = z.infer<typeof TimesheetApprovalDtoSchema>;

export const TimesheetDayDtoSchema = z.object({
  workDate: z.string().date(),
  entries: z.array(TimeEntryDtoSchema),
  totalMinutes: z.number().int().nonnegative(),
  draftCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
});
export type TimesheetDayDto = z.infer<typeof TimesheetDayDtoSchema>;

export const CreateShowRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
});
export type CreateShowRequest = z.infer<typeof CreateShowRequestSchema>;

export const CreateTaskRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const AssignShowEmployeeRequestSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((value) => value.toUpperCase()),
});
export type AssignShowEmployeeRequest = z.infer<typeof AssignShowEmployeeRequestSchema>;

export const CreateTimeEntryRequestSchema = z
  .object({
    showId: ObjectIdStringSchema,
    taskId: ObjectIdStringSchema,
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    description: z.string().trim().min(3).max(1_000),
    billable: z.boolean().default(true),
  })
  .refine((value) => new Date(value.endedAt) > new Date(value.startedAt), {
    path: ['endedAt'],
    message: 'End time must be after start time',
  });
export type CreateTimeEntryRequest = z.infer<typeof CreateTimeEntryRequestSchema>;

export const TimesheetDateQuerySchema = z.object({
  workDate: z.string().date().optional(),
});

export const TimesheetDecisionRequestSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().max(1_000).default(''),
  })
  .refine((value) => value.decision === 'approved' || value.comment.length >= 3, {
    path: ['comment'],
    message: 'A rejection reason is required',
  });
export type TimesheetDecisionRequest = z.infer<typeof TimesheetDecisionRequestSchema>;
