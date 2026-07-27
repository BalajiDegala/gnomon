import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { sensitiveLogPaths } from './config/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { importRouter } from './modules/imports/import.routes.js';
import { reconciliationRouter } from './modules/reconciliation/reconciliation.routes.js';
import {
  regularisationApprovalRouter,
  regularisationRouter,
} from './modules/regularisations/regularisation.routes.js';
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
app.use('/api/v1/imports', importRouter);
app.use('/api/v1/reconciliation', reconciliationRouter);
app.use('/api/v1/regularisations', regularisationRouter);
app.use('/api/v1/approvals/regularisations', regularisationApprovalRouter);
app.use('/api/v1/shows', showRouter);
app.use('/api/v1/timecard', timecardRouter);
app.use('/api/v1/timesheets', timesheetRouter);

app.use(notFoundHandler);
app.use(errorHandler);
