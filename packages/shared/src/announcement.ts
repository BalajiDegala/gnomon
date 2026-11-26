import { z } from 'zod';

/**
 * Messages managers send to everyone or to whole departments. Each recipient
 * gets a bell notification and sees the message on their Overview page until
 * it expires.
 */
export const AnnouncementAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({
    type: z.literal('departments'),
    departments: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  }),
]);
export type AnnouncementAudience = z.infer<typeof AnnouncementAudienceSchema>;

export const announcementDurationOptions = [1, 3, 7, 14, 30] as const;

export const CreateAnnouncementRequestSchema = z.object({
  title: z.string().trim().min(3, 'Add a short title').max(120),
  message: z.string().trim().min(3, 'Write a message').max(2_000),
  audience: AnnouncementAudienceSchema,
  /** How many days the message stays on the Overview page. */
  durationDays: z
    .number()
    .int()
    .refine((days) => (announcementDurationOptions as readonly number[]).includes(days), {
      message: 'Choose how long the message is shown',
    })
    .default(7),
});
export type CreateAnnouncementRequest = z.input<typeof CreateAnnouncementRequestSchema>;

export const AnnouncementDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  audience: AnnouncementAudienceSchema,
  senderEmployeeId: z.string(),
  senderName: z.string(),
  recipientCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  /** When the viewer marked it as read; null when unread or sent by the viewer. */
  readAt: z.string().datetime().nullable(),
  sentByMe: z.boolean(),
  canWithdraw: z.boolean(),
});
export type AnnouncementDto = z.infer<typeof AnnouncementDtoSchema>;

export const AnnouncementDepartmentSchema = z.object({
  name: z.string(),
  employeeCount: z.number().int().nonnegative(),
});
export type AnnouncementDepartment = z.infer<typeof AnnouncementDepartmentSchema>;

export const AnnouncementFeedSchema = z.object({
  /** Whether the viewer may send announcements (managers, HR and admins). */
  canSend: z.boolean(),
  /** Active announcements addressed to or sent by the viewer, newest first. */
  items: z.array(AnnouncementDtoSchema),
});
export type AnnouncementFeed = z.infer<typeof AnnouncementFeedSchema>;

export function describeAnnouncementAudience(audience: AnnouncementAudience): string {
  if (audience.type === 'all') return 'Everyone';
  if (audience.departments.length <= 2) return audience.departments.join(' & ');
  return `${audience.departments.length} departments`;
}
