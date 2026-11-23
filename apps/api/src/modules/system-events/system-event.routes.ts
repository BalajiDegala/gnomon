import { SystemEventQuerySchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { getSystemEvent, listSystemEvents } from './system-event.service.js';

/** Debug event log; System administrators only. */
export const systemEventRouter = Router();
systemEventRouter.use(requireAuth, requirePermission('system:events:read'));

systemEventRouter.get('/', async (request, response) => {
  const query = SystemEventQuerySchema.parse(request.query);
  response.json(await listSystemEvents(query));
});

systemEventRouter.get('/:eventId', async (request, response) => {
  response.json({ event: await getSystemEvent(String(request.params.eventId)) });
});
