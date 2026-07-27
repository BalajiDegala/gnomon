import {
  CreateTimeEntryRequestSchema,
  TimesheetDateQuerySchema,
  TimesheetDecisionRequestSchema,
} from '@gnomon/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import {
  createTimeEntry,
  decideTimeEntry,
  deleteDraftTimeEntry,
  getTimesheetDay,
  getTimesheetOptions,
  listTimesheetApprovals,
  submitTimesheetDay,
} from './timesheet.service.js';

const EntryParamsSchema = z.object({ entryId: z.string().regex(/^[a-f\d]{24}$/i) });
const SubmitRequestSchema = z.object({ workDate: z.string().date() });

export const timesheetRouter = Router();

timesheetRouter.use(requireAuth, requirePermission('timesheet:create', ['self', 'company']));

timesheetRouter.get('/options', async (request, response) => {
  response.json({ options: await getTimesheetOptions(request.authUser!.employeeId) });
});

timesheetRouter.get('/', async (request, response) => {
  const { workDate } = TimesheetDateQuerySchema.parse(request.query);
  response.json({ day: await getTimesheetDay(request.authUser!.employeeId, workDate) });
});

timesheetRouter.post('/entries', async (request, response) => {
  const input = CreateTimeEntryRequestSchema.parse(request.body);
  response.status(201).json({ day: await createTimeEntry(request.authUser!.employeeId, input) });
});

timesheetRouter.delete('/entries/:entryId', async (request, response) => {
  const { entryId } = EntryParamsSchema.parse(request.params);
  response.json({ day: await deleteDraftTimeEntry(request.authUser!.employeeId, entryId) });
});

timesheetRouter.post('/submit', async (request, response) => {
  const { workDate } = SubmitRequestSchema.parse(request.body);
  response.json({ day: await submitTimesheetDay(request.authUser!.employeeId, workDate) });
});

export const timesheetApprovalRouter = Router();

timesheetApprovalRouter.use(requireAuth, requirePermission('timesheet:approve'));

timesheetApprovalRouter.get('/', async (request, response) => {
  response.json({ entries: await listTimesheetApprovals(request.authUser!) });
});

timesheetApprovalRouter.post('/:entryId/decision', async (request, response) => {
  const { entryId } = EntryParamsSchema.parse(request.params);
  const input = TimesheetDecisionRequestSchema.parse(request.body);
  response.json({ entry: await decideTimeEntry(request.authUser!, entryId, input) });
});
