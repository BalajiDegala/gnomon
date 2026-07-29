import { CalendarQuerySchema, ManagedCalendarQuerySchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { getManagedCalendar, getPersonalCalendar } from './calendar.service.js';

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

calendarRouter.get('/', requirePermission('attendance:self:read'), async (request, response) => {
  const { month } = CalendarQuerySchema.parse(request.query);
  response.json({ calendar: await getPersonalCalendar(request.authUser!.employeeId, month) });
});

calendarRouter.get(
  '/managed',
  requirePermission('attendance:team:read', ['direct_reports', 'show', 'company']),
  async (request, response) => {
    const query = ManagedCalendarQuerySchema.parse(request.query);
    response.json({ calendar: await getManagedCalendar(request.authUser!, query) });
  },
);
