import {
  AssignShowEmployeeRequestSchema,
  CreateShowRequestSchema,
  CreateTaskRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  assignEmployeeToShow,
  createShow,
  createShowTask,
  listManageableShows,
} from './show.service.js';

const ShowParamsSchema = z.object({ showId: z.string().regex(/^[a-f\d]{24}$/i) });

export const showRouter = Router();

showRouter.use(requireAuth, requirePermission('show:manage'));

showRouter.get('/', async (request, response) => {
  response.json({ shows: await listManageableShows(request.authUser!) });
});

showRouter.post('/', async (request, response) => {
  const input = CreateShowRequestSchema.parse(request.body);
  response.status(201).json({ show: await createShow(request.authUser!, input) });
});

showRouter.post('/:showId/tasks', async (request, response) => {
  const { showId } = ShowParamsSchema.parse(request.params);
  const input = CreateTaskRequestSchema.parse(request.body);
  response.status(201).json({ show: await createShowTask(request.authUser!, showId, input) });
});

showRouter.post('/:showId/assignments', async (request, response) => {
  const { showId } = ShowParamsSchema.parse(request.params);
  const input = AssignShowEmployeeRequestSchema.parse(request.body);
  response.status(201).json({ show: await assignEmployeeToShow(request.authUser!, showId, input) });
});
