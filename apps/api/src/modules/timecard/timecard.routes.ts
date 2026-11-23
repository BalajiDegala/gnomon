import { StartTimecardRequestSchema } from '@gnomon/shared';
import { Router, type Request } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { getAttendanceSignals } from '../attendance/attendance.service.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { listAttendanceActionItems } from './action-items.service.js';
import { getTodayTimecard, startTimecard, stopTimecard } from './timecard.service.js';

function getClientMetadata(request: Request) {
  return {
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    userAgent: (request.get('user-agent') ?? 'unknown').slice(0, 1_024),
  };
}

export const timecardRouter = Router();

timecardRouter.use(requireAuth);

async function withAttendanceSignals(
  timecard: Awaited<ReturnType<typeof getTodayTimecard>>,
  employeeId: string,
) {
  return {
    timecard,
    signals: await getAttendanceSignals(employeeId, timecard.workDate),
    reconciliation: await reconcileDailyTimecard(employeeId, timecard.workDate),
  };
}

timecardRouter.get(
  '/today',
  requirePermission('attendance:self:read'),
  async (request, response) => {
    const timecard = await getTodayTimecard(request.authUser!.employeeId);
    response.json(await withAttendanceSignals(timecard, request.authUser!.employeeId));
  },
);

/** Past days that need leave or a regularisation from the signed-in employee. */
timecardRouter.get(
  '/action-items',
  requirePermission('attendance:self:read'),
  async (request, response) => {
    response.json(await listAttendanceActionItems(request.authUser!.employeeId));
  },
);

timecardRouter.post(
  '/start',
  requirePermission('attendance:self:write'),
  async (request, response) => {
    const input = StartTimecardRequestSchema.parse(request.body ?? {});
    const timecard = await startTimecard(
      request.authUser!.employeeId,
      getClientMetadata(request),
      input,
    );
    response.status(201).json(await withAttendanceSignals(timecard, request.authUser!.employeeId));
  },
);

timecardRouter.post(
  '/stop',
  requirePermission('attendance:self:write'),
  async (request, response) => {
    const timecard = await stopTimecard(
      request.authUser!.employeeId,
      request.authUser!.id,
      getClientMetadata(request),
    );
    response.json(await withAttendanceSignals(timecard, request.authUser!.employeeId));
  },
);
