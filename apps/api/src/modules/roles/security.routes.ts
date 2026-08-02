import {
  AssignSecurityRoleRequestSchema,
  ProvisionEmployeeAccountRequestSchema,
  UpdateEmployeeAccountRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import {
  assignSecurityRole,
  listSecurityDirectory,
  provisionEmployeeAccount,
  revokeSecurityRole,
  updateEmployeeAccount,
} from './security.service.js';

const UserParamsSchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) });
const AssignmentParamsSchema = UserParamsSchema.extend({
  assignmentId: z.string().regex(/^[a-f\d]{24}$/i),
});

export const securityAdministrationRouter = Router();
securityAdministrationRouter.use(requireAuth);

securityAdministrationRouter.get('/', async (request, response) => {
  response.json({ directory: await listSecurityDirectory(request.authUser!) });
});

securityAdministrationRouter.post('/accounts', async (request, response) => {
  const input = ProvisionEmployeeAccountRequestSchema.parse(request.body);
  response.status(201).json({
    directory: await provisionEmployeeAccount(request.authUser!, input),
  });
});

securityAdministrationRouter.patch('/accounts/:userId', async (request, response) => {
  const { userId } = UserParamsSchema.parse(request.params);
  const input = UpdateEmployeeAccountRequestSchema.parse(request.body);
  response.json({ directory: await updateEmployeeAccount(request.authUser!, userId, input) });
});

securityAdministrationRouter.put('/accounts/:userId/roles', async (request, response) => {
  const { userId } = UserParamsSchema.parse(request.params);
  const input = AssignSecurityRoleRequestSchema.parse(request.body);
  response.json({ directory: await assignSecurityRole(request.authUser!, userId, input) });
});

securityAdministrationRouter.post(
  '/accounts/:userId/roles/:assignmentId/revoke',
  async (request, response) => {
    const { userId, assignmentId } = AssignmentParamsSchema.parse(request.params);
    response.json({
      directory: await revokeSecurityRole(request.authUser!, userId, assignmentId),
    });
  },
);
