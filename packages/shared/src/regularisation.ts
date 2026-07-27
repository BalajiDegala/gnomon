import { z } from 'zod';

export const RegularisationSourceSchema = z.enum(['biometric', 'website']);
export type RegularisationSource = z.infer<typeof RegularisationSourceSchema>;

export const MissingEventSchema = z.enum(['opening', 'closing', 'both']);
export type MissingEvent = z.infer<typeof MissingEventSchema>;

export const RegularisationStatusSchema = z.enum([
  'pending_manager',
  'pending_hr',
  'approved',
  'rejected',
  'cancelled',
]);
export type RegularisationStatus = z.infer<typeof RegularisationStatusSchema>;

export const RegularisationDecisionSchema = z.object({
  step: z.number().int().min(1).max(2),
  decision: z.enum(['approved', 'rejected']),
  actorDisplayName: z.string(),
  actorRole: z.enum(['reporting_manager', 'hr', 'attendance_admin', 'system_admin']),
  comment: z.string(),
  decidedAt: z.string().datetime(),
});
export type RegularisationDecision = z.infer<typeof RegularisationDecisionSchema>;

export const RegularisationRequestDtoSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  employeeCode: z.string(),
  employeeDisplayName: z.string(),
  workDate: z.string().date(),
  source: RegularisationSourceSchema,
  missingEvent: MissingEventSchema,
  requestedStart: z.string().datetime(),
  requestedEnd: z.string().datetime(),
  requestedMinutes: z.number().int().positive(),
  reason: z.string(),
  status: RegularisationStatusSchema,
  currentStep: z.number().int().min(1).max(3),
  approvalPolicyVersion: z.string(),
  decisions: z.array(RegularisationDecisionSchema),
  submittedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RegularisationRequestDto = z.infer<typeof RegularisationRequestDtoSchema>;

export const CreateRegularisationRequestSchema = z
  .object({
    workDate: z.string().date(),
    source: RegularisationSourceSchema,
    missingEvent: MissingEventSchema,
    requestedStart: z.string().datetime(),
    requestedEnd: z.string().datetime(),
    reason: z.string().trim().min(10).max(1_000),
  })
  .refine((value) => new Date(value.requestedEnd) > new Date(value.requestedStart), {
    path: ['requestedEnd'],
    message: 'Corrected end must be after corrected start',
  });
export type CreateRegularisationRequest = z.infer<typeof CreateRegularisationRequestSchema>;

export const RegularisationDecisionRequestSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().max(1_000).default(''),
  })
  .refine((value) => value.decision === 'approved' || value.comment.length >= 3, {
    path: ['comment'],
    message: 'A rejection reason is required',
  });
export type RegularisationDecisionRequest = z.infer<typeof RegularisationDecisionRequestSchema>;
