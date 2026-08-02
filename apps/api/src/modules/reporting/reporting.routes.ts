import { WorkforceReportQuerySchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { buildWorkforceReport } from './reporting.service.js';

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

reportingRouter.get('/workforce', async (request, response) => {
  const input = WorkforceReportQuerySchema.parse(request.query);
  response.json({ report: await buildWorkforceReport(request.authUser!, input) });
});
