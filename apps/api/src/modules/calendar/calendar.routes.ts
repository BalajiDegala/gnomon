import { CalendarQuerySchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { getPersonalCalendar } from './calendar.service.js';

export const calendarRouter = Router();
calendarRouter.use(requireAuth, requirePermission('attendance:self:read'));

calendarRouter.get('/', async (request, response) => {
  const { month } = CalendarQuerySchema.parse(request.query);
  response.json({ calendar: await getPersonalCalendar(request.authUser!.employeeId, month) });
});
