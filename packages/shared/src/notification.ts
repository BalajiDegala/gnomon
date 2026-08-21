import { z } from 'zod';

export const NotificationKindSchema = z.enum([
  'leave_approval_required',
  'leave_approved',
  'leave_rejected',
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationDtoSchema = z.object({
  id: z.string(),
  kind: NotificationKindSchema,
  title: z.string(),
  message: z.string(),
  href: z.string(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

export const NotificationListDtoSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  items: z.array(NotificationDtoSchema),
});
export type NotificationListDto = z.infer<typeof NotificationListDtoSchema>;
