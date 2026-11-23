import { z } from 'zod';

export const SystemEventCategorySchema = z.enum([
  'auth',
  'timecard',
  'timesheet',
  'leave',
  'regularisation',
  'import',
  'employee',
  'security',
  'administration',
  'notification',
  'job',
  'system',
]);
export type SystemEventCategory = z.infer<typeof SystemEventCategorySchema>;

export const SystemEventSeveritySchema = z.enum(['info', 'warn', 'error']);
export type SystemEventSeverity = z.infer<typeof SystemEventSeveritySchema>;

export const SystemEventOutcomeSchema = z.enum(['success', 'failure']);
export type SystemEventOutcome = z.infer<typeof SystemEventOutcomeSchema>;

export const SystemEventPartySchema = z.object({
  type: z.string(),
  id: z.string().nullable(),
  employeeCode: z.string().nullable(),
  label: z.string().nullable(),
});
export type SystemEventParty = z.infer<typeof SystemEventPartySchema>;

export const SystemEventRequestSchema = z.object({
  method: z.string(),
  path: z.string(),
  route: z.string().nullable(),
  status: z.number().int().nullable(),
  durationMs: z.number().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type SystemEventRequest = z.infer<typeof SystemEventRequestSchema>;

export const SystemEventDtoSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  category: SystemEventCategorySchema,
  action: z.string(),
  severity: SystemEventSeveritySchema,
  outcome: SystemEventOutcomeSchema,
  message: z.string(),
  errorCode: z.string().nullable(),
  requestId: z.string().nullable(),
  actor: SystemEventPartySchema.nullable(),
  subject: SystemEventPartySchema.nullable(),
  request: SystemEventRequestSchema.nullable(),
  /** Redacted, size-limited details. Only returned by the single-event endpoint. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SystemEventDto = z.infer<typeof SystemEventDtoSchema>;

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        : value,
    z.array(item).max(20).optional(),
  );

export const SystemEventQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    category: csv(SystemEventCategorySchema),
    severity: csv(SystemEventSeveritySchema),
    outcome: SystemEventOutcomeSchema.optional(),
    /** Matches the actor or the subject employee code. */
    employeeCode: z
      .string()
      .trim()
      .max(50)
      .transform((value) => value.toUpperCase())
      .optional(),
    requestId: z.string().trim().max(100).optional(),
    q: z.string().trim().max(200).optional(),
    /** Opaque: `<createdAt ms>.<event id>` of the last event on the previous page. */
    cursor: z
      .string()
      .regex(/^\d{1,16}\.[0-9a-f]{24}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'from must be before to',
    path: ['from'],
  });
export type SystemEventQuery = z.infer<typeof SystemEventQuerySchema>;

export const SystemEventListResponseSchema = z.object({
  events: z.array(SystemEventDtoSchema),
  nextCursor: z.string().nullable(),
});
export type SystemEventListResponse = z.infer<typeof SystemEventListResponseSchema>;
