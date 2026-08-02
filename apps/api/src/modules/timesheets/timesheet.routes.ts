import {
  CreateTimeEntryRequestSchema,
  TimesheetDateQuerySchema,
  UpdateTimeEntryRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  createTimeEntry,
  deleteTimeEntry,
  getTimesheetDay,
  getTimesheetOptions,
  updateTimeEntry,
} from './timesheet.service.js';

const EntryParamsSchema = z.object({ entryId: z.string().regex(/^[a-f\d]{24}$/i) });

export const timesheetRouter = Router();

timesheetRouter.use(requireAuth, requirePermission('timesheet:create', ['self', 'company']));

timesheetRouter.get('/options', async (_request, response) => {
  response.json({ options: await getTimesheetOptions() });
});

timesheetRouter.get('/', async (request, response) => {
  const { workDate } = TimesheetDateQuerySchema.parse(request.query);
  response.json({ day: await getTimesheetDay(request.authUser!.employeeId, workDate) });
});

timesheetRouter.post('/entries', async (request, response) => {
  const input = CreateTimeEntryRequestSchema.parse(request.body);
  response.status(201).json({ day: await createTimeEntry(request.authUser!.employeeId, input) });
});

timesheetRouter.patch('/entries/:entryId', async (request, response) => {
  const { entryId } = EntryParamsSchema.parse(request.params);
  const input = UpdateTimeEntryRequestSchema.parse(request.body);
  response.json({ day: await updateTimeEntry(request.authUser!.employeeId, entryId, input) });
});

timesheetRouter.delete('/entries/:entryId', async (request, response) => {
  const { entryId } = EntryParamsSchema.parse(request.params);
  response.json({ day: await deleteTimeEntry(request.authUser!.employeeId, entryId) });
});
