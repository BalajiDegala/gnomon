import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notification.service.js';

const ListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const NotificationParamsSchema = z.object({
  notificationId: z.string().regex(/^[a-f\d]{24}$/i),
});

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get('/', async (request, response) => {
  const { limit } = ListQuerySchema.parse(request.query);
  response.json({ notifications: await listNotifications(request.authUser!.employeeId, limit) });
});

notificationRouter.post('/read-all', async (request, response) => {
  response.json({
    notifications: await markAllNotificationsRead(request.authUser!.employeeId),
  });
});

notificationRouter.post('/:notificationId/read', async (request, response) => {
  const { notificationId } = NotificationParamsSchema.parse(request.params);
  response.json({
    notifications: await markNotificationRead(request.authUser!.employeeId, notificationId),
  });
});
