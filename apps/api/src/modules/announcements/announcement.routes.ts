import { CreateAnnouncementRequestSchema } from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/errors.js';
import {
  canSendAnnouncements,
  createAnnouncement,
  listAnnouncementDepartments,
  listAnnouncementFeed,
  markAnnouncementRead,
  withdrawAnnouncement,
} from './announcement.service.js';

const ParamsSchema = z.object({ announcementId: z.string().regex(/^[a-f\d]{24}$/i) });

/** Everyone reads their messages; sending is checked per request (managers, HR, admins). */
export const announcementRouter = Router();
announcementRouter.use(requireAuth);

announcementRouter.get('/', async (request, response) => {
  response.json({ announcements: await listAnnouncementFeed(request.authUser!) });
});

announcementRouter.get('/departments', async (request, response) => {
  if (!(await canSendAnnouncements(request.authUser!))) {
    throw new HttpError(403, 'Only managers can send messages', 'ANNOUNCEMENT_FORBIDDEN');
  }
  response.json({ departments: await listAnnouncementDepartments() });
});

announcementRouter.post('/', async (request, response) => {
  const input = CreateAnnouncementRequestSchema.parse(request.body);
  response.status(201).json({ announcement: await createAnnouncement(request.authUser!, input) });
});

announcementRouter.post('/:announcementId/read', async (request, response) => {
  const { announcementId } = ParamsSchema.parse(request.params);
  await markAnnouncementRead(request.authUser!, announcementId);
  response.status(204).end();
});

announcementRouter.delete('/:announcementId', async (request, response) => {
  const { announcementId } = ParamsSchema.parse(request.params);
  await withdrawAnnouncement(request.authUser!, announcementId);
  response.status(204).end();
});
