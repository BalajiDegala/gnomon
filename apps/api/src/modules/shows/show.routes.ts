import { CreateShowRequestSchema, UpdateShowRequestSchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { createShow, listManageableShows, updateShow } from './show.service.js';

export const showRouter = Router();

showRouter.use(requireAuth, requirePermission('show:manage'));

showRouter.get('/', async (request, response) => {
  response.json({ shows: await listManageableShows(request.authUser!) });
});

showRouter.post('/', async (request, response) => {
  const input = CreateShowRequestSchema.parse(request.body);
  response.status(201).json({ show: await createShow(request.authUser!, input) });
});

showRouter.patch('/:showId', async (request, response) => {
  const input = UpdateShowRequestSchema.parse(request.body);
  response.json({ show: await updateShow(request.authUser!, request.params.showId!, input) });
});
