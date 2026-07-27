import { z } from 'zod';

const ObjectIdStringSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid identifier is required');

export const ShowStatusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);
export type ShowStatus = z.infer<typeof ShowStatusSchema>;

export const TaskStatusSchema = z.enum(['active', 'inactive']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TimeEntryStatusSchema = z.enum(['draft', 'submitted', 'approved', 'rejected']);
export type TimeEntryStatus = z.infer<typeof TimeEntryStatusSchema>;

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
});
export type TimeEntryDto = z.infer<typeof TimeEntryDtoSchema>;

export const TimesheetDayDtoSchema = z.object({
  workDate: z.string().date(),
  entries: z.array(TimeEntryDtoSchema),
  totalMinutes: z.number().int().nonnegative(),
  draftCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
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
