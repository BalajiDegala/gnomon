import {
  CreateEmployeeRequestSchema,
  EmployeeDirectoryQuerySchema,
  UpdateEmployeeRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { createEmployee, listEmployees, updateEmployee } from './employee.service.js';

const EmployeeParamsSchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i),
});

export const employeeRouter = Router();
employeeRouter.use(requireAuth);

employeeRouter.get('/', requirePermission('employee:read'), async (request, response) => {
  const input = EmployeeDirectoryQuerySchema.parse(request.query);
  response.json({ directory: await listEmployees(request.authUser!, input) });
});

employeeRouter.post('/', requirePermission('employee:update'), async (request, response) => {
  const input = CreateEmployeeRequestSchema.parse(request.body);
  response.status(201).json({ employee: await createEmployee(request.authUser!, input) });
});

employeeRouter.patch(
  '/:employeeId',
  requirePermission('employee:update'),
  async (request, response) => {
    const { employeeId } = EmployeeParamsSchema.parse(request.params);
    const input = UpdateEmployeeRequestSchema.parse(request.body);
    response.json({ employee: await updateEmployee(request.authUser!, employeeId, input) });
  },
);
