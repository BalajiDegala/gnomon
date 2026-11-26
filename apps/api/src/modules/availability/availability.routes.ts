import { UpdateAvailabilityModeRequestSchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import {
  getMyAvailability,
  listAvailability,
  setMyAvailabilityMode,
} from './availability.service.js';

/** Every signed-in employee can see colleagues' availability and set their own mode. */
export const availabilityRouter = Router();
availabilityRouter.use(requireAuth);

availabilityRouter.get('/', async (request, response) => {
  response.json({ availability: await listAvailability(request.authUser!.employeeId) });
});

availabilityRouter.get('/me', async (request, response) => {
  response.json({ availability: await getMyAvailability(request.authUser!.employeeId) });
});

availabilityRouter.put('/me', async (request, response) => {
  const { mode } = UpdateAvailabilityModeRequestSchema.parse(request.body);
  response.json({
    availability: await setMyAvailabilityMode(request.authUser!.employeeId, mode),
  });
});
