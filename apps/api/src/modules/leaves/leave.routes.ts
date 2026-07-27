import {
  CreateLeaveRequestSchema,
  LeaveBalanceQuerySchema,
  LeaveDecisionRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  cancelLeave,
  createLeave,
  decideLeave,
  listLeaveApprovals,
  listMyLeaves,
} from './leave.service.js';

const RequestParamsSchema = z.object({ requestId: z.string().regex(/^[a-f\d]{24}$/i) });

export const leaveRouter = Router();
leaveRouter.use(requireAuth, requirePermission('leave:create'));

leaveRouter.get('/mine', async (request, response) => {
  const { year } = LeaveBalanceQuerySchema.parse(request.query);
  response.json(await listMyLeaves(request.authUser!, year));
});

leaveRouter.post('/', async (request, response) => {
  const input = CreateLeaveRequestSchema.parse(request.body);
  response.status(201).json({ request: await createLeave(request.authUser!, input) });
});

leaveRouter.post('/:requestId/cancel', async (request, response) => {
  const { requestId } = RequestParamsSchema.parse(request.params);
  response.json({ request: await cancelLeave(request.authUser!, requestId) });
});

export const leaveApprovalRouter = Router();
leaveApprovalRouter.use(requireAuth, requirePermission('leave:approve'));

leaveApprovalRouter.get('/', async (request, response) => {
  response.json({ requests: await listLeaveApprovals(request.authUser!) });
});

leaveApprovalRouter.post('/:requestId/decision', async (request, response) => {
  const { requestId } = RequestParamsSchema.parse(request.params);
  const input = LeaveDecisionRequestSchema.parse(request.body);
  response.json({ request: await decideLeave(request.authUser!, requestId, input) });
});
