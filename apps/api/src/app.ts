import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { sensitiveLogPaths } from './config/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { employeeRouter } from './modules/employees/employee.routes.js';
import { importRouter } from './modules/imports/import.routes.js';
import { leaveApprovalRouter, leaveRouter } from './modules/leaves/leave.routes.js';
import { notificationRouter } from './modules/notifications/notification.routes.js';
import {
  approvalPolicyAdministrationRouter,
  employeeLocationAdministrationRouter,
  holidayAdministrationRouter,
  leaveBalanceAdministrationRouter,
  locationAdministrationRouter,
} from './modules/policies/policy.routes.js';
import { reconciliationRouter } from './modules/reconciliation/reconciliation.routes.js';
import { reportingRouter } from './modules/reporting/reporting.routes.js';
import {
  regularisationApprovalRouter,
  regularisationRouter,
} from './modules/regularisations/regularisation.routes.js';
import { securityAdministrationRouter } from './modules/roles/security.routes.js';
import { showRouter } from './modules/shows/show.routes.js';
import { timecardRouter } from './modules/timecard/timecard.routes.js';
import { timesheetRouter } from './modules/timesheets/timesheet.routes.js';
import { healthRouter } from './routes/health.routes.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  }),
);
app.use(
  pinoHttp({
    enabled: env.NODE_ENV !== 'test',
    redact: {
      paths: [...sensitiveLogPaths],
      censor: '[REDACTED]',
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/calendar', calendarRouter);
app.use('/api/v1/employees', employeeRouter);
app.use('/api/v1/imports', importRouter);
app.use('/api/v1/leaves', leaveRouter);
app.use('/api/v1/approvals/leaves', leaveApprovalRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/administration/holidays', holidayAdministrationRouter);
app.use('/api/v1/administration/approval-policies', approvalPolicyAdministrationRouter);
app.use('/api/v1/administration/locations', locationAdministrationRouter);
app.use('/api/v1/administration/employee-locations', employeeLocationAdministrationRouter);
app.use('/api/v1/administration/leave-balances', leaveBalanceAdministrationRouter);
app.use('/api/v1/administration/security', securityAdministrationRouter);
app.use('/api/v1/reconciliation', reconciliationRouter);
app.use('/api/v1/reports', reportingRouter);
app.use('/api/v1/regularisations', regularisationRouter);
app.use('/api/v1/approvals/regularisations', regularisationApprovalRouter);
app.use('/api/v1/shows', showRouter);
app.use('/api/v1/timecard', timecardRouter);
app.use('/api/v1/timesheets', timesheetRouter);

app.use(notFoundHandler);
app.use(errorHandler);
