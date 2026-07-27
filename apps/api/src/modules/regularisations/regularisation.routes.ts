import {
  CreateRegularisationRequestSchema,
  RegularisationDecisionRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  cancelRegularisation,
  createRegularisation,
  decideRegularisation,
  listMyRegularisations,
  listRegularisationApprovals,
} from './regularisation.service.js';

const RequestParamsSchema = z.object({ requestId: z.string().regex(/^[a-f\d]{24}$/i) });

export const regularisationRouter = Router();

regularisationRouter.use(requireAuth, requirePermission('regularisation:create'));

regularisationRouter.get('/mine', async (request, response) => {
  response.json({ requests: await listMyRegularisations(request.authUser!) });
});

regularisationRouter.post('/', async (request, response) => {
  const input = CreateRegularisationRequestSchema.parse(request.body);
  response.status(201).json({ request: await createRegularisation(request.authUser!, input) });
});

regularisationRouter.post('/:requestId/cancel', async (request, response) => {
  const { requestId } = RequestParamsSchema.parse(request.params);
  response.json({ request: await cancelRegularisation(request.authUser!, requestId) });
});

export const regularisationApprovalRouter = Router();

regularisationApprovalRouter.use(requireAuth, requirePermission('regularisation:approve'));

regularisationApprovalRouter.get('/', async (request, response) => {
  response.json({ requests: await listRegularisationApprovals(request.authUser!) });
});

regularisationApprovalRouter.post('/:requestId/decision', async (request, response) => {
  const { requestId } = RequestParamsSchema.parse(request.params);
  const input = RegularisationDecisionRequestSchema.parse(request.body);
  response.json({ request: await decideRegularisation(request.authUser!, requestId, input) });
});
