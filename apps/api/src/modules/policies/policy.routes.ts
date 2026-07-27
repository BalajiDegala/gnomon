import {
  EmployeeLeaveBalanceQuerySchema,
  PolicyYearQuerySchema,
  UpdateLeaveBalanceRequestSchema,
  UpsertHolidayRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  archiveHoliday,
  getEmployeeLeaveBalances,
  listAdminHolidays,
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
