import {
  CreateLocationRequestSchema,
  EmployeeLeaveBalanceQuerySchema,
  EmployeeLocationQuerySchema,
  PolicyYearQuerySchema,
  UpdateEmployeeLocationRequestSchema,
  UpdateLeaveBalanceRequestSchema,
  UpsertHolidayRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  archiveHoliday,
  createLocation,
  getEmployeeLocation,
  getEmployeeLeaveBalances,
  listAdminHolidays,
  listAdminLocations,
  updateEmployeeLocation,
  updateEmployeeLeaveBalance,
  upsertHoliday,
} from './policy.service.js';

const HolidayParamsSchema = z.object({ holidayId: z.string().regex(/^[a-f\d]{24}$/i) });
const EmployeeParamsSchema = z.object({ employeeCode: z.string().trim().min(2).max(50) });

export const holidayAdministrationRouter = Router();
holidayAdministrationRouter.use(requireAuth, requirePermission('policy:manage'));

holidayAdministrationRouter.get('/', async (request, response) => {
  const { year = new Date().getUTCFullYear() } = PolicyYearQuerySchema.parse(request.query);
  response.json({ holidays: await listAdminHolidays(request.authUser!, year) });
});

holidayAdministrationRouter.put('/', async (request, response) => {
  const input = UpsertHolidayRequestSchema.parse(request.body);
  response.json({ holiday: await upsertHoliday(request.authUser!, input) });
});

holidayAdministrationRouter.post('/:holidayId/archive', async (request, response) => {
  const { holidayId } = HolidayParamsSchema.parse(request.params);
  response.json({ holiday: await archiveHoliday(request.authUser!, holidayId) });
});

export const locationAdministrationRouter = Router();
locationAdministrationRouter.use(requireAuth);

locationAdministrationRouter.get('/', async (request, response) => {
  response.json({ directory: await listAdminLocations(request.authUser!) });
});

locationAdministrationRouter.post('/', async (request, response) => {
  const input = CreateLocationRequestSchema.parse(request.body);
  response.status(201).json({ directory: await createLocation(request.authUser!, input) });
});

export const employeeLocationAdministrationRouter = Router();
employeeLocationAdministrationRouter.use(requireAuth, requirePermission('employee:update'));

employeeLocationAdministrationRouter.get('/', async (request, response) => {
  const { employeeCode } = EmployeeLocationQuerySchema.parse(request.query);
  response.json({ employee: await getEmployeeLocation(request.authUser!, employeeCode) });
});

employeeLocationAdministrationRouter.put('/:employeeCode', async (request, response) => {
  const { employeeCode } = EmployeeParamsSchema.parse(request.params);
  const input = UpdateEmployeeLocationRequestSchema.parse(request.body);
  response.json({
    employee: await updateEmployeeLocation(request.authUser!, employeeCode.toUpperCase(), input),
  });
});

export const leaveBalanceAdministrationRouter = Router();
leaveBalanceAdministrationRouter.use(requireAuth, requirePermission('employee:update'));

leaveBalanceAdministrationRouter.get('/', async (request, response) => {
  const input = EmployeeLeaveBalanceQuerySchema.parse(request.query);
  response.json({
    employee: await getEmployeeLeaveBalances(request.authUser!, input.employeeCode, input.year),
  });
});

leaveBalanceAdministrationRouter.put('/:employeeCode', async (request, response) => {
  const { employeeCode } = EmployeeParamsSchema.parse(request.params);
  const input = UpdateLeaveBalanceRequestSchema.parse(request.body);
  response.json({
    employee: await updateEmployeeLeaveBalance(
      request.authUser!,
      employeeCode.toUpperCase(),
      input,
    ),
  });
});
