import { ShiftRequestSchema } from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { listShifts, saveShift } from './shift.service.js';

const ShiftParamsSchema = z.object({ shiftId: z.string().regex(/^[a-f\d]{24}$/i) });

export const shiftAdministrationRouter = Router();
shiftAdministrationRouter.use(requireAuth, requirePermission('policy:manage'));

shiftAdministrationRouter.get('/', async (_request, response) => {
  response.json({ shifts: await listShifts() });
});

shiftAdministrationRouter.post('/', async (request, response) => {
  const input = ShiftRequestSchema.parse(request.body);
  response.status(201).json({ shifts: await saveShift(request.authUser!.id, null, input) });
});

shiftAdministrationRouter.put('/:shiftId', async (request, response) => {
  const { shiftId } = ShiftParamsSchema.parse(request.params);
  const input = ShiftRequestSchema.parse(request.body);
  response.json({ shifts: await saveShift(request.authUser!.id, shiftId, input) });
});
