import { DailyReconciliationQuerySchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { reconcileDailyTimecard } from './reconciliation.service.js';

export const reconciliationRouter = Router();

reconciliationRouter.use(requireAuth, requirePermission('attendance:self:read'));

reconciliationRouter.get('/', async (request, response) => {
  const { workDate } = DailyReconciliationQuerySchema.parse(request.query);
  response.json({
    reconciliation: await reconcileDailyTimecard(request.authUser!.employeeId, workDate),
  });
});
