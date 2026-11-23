import { createServer } from 'node:http';

import pino from 'pino';

import { app } from './app.js';
import { env } from './config/env.js';
import { ensureAllIndexes } from './db/ensure-indexes.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';
import { migrateLegacySickLeave } from './modules/leaves/leave-type.migration.js';
import { startDailyAttendanceScheduler } from './modules/reconciliation/daily-attendance.job.js';
import { ensureSystemRoles } from './modules/roles/system-roles.js';
import { recordEvent } from './modules/system-events/system-event.service.js';

const logger = pino();

async function start(): Promise<void> {
  await connectDatabase();
  const migrated = await migrateLegacySickLeave();
  if (migrated.requests > 0 || migrated.balances > 0) {
    logger.info(migrated, 'Merged legacy sick leave into casual/sick leave');
  }
  const indexes = await ensureAllIndexes(logger);
  // Keeps built-in role permissions current (e.g. new permissions after an upgrade).
  await ensureSystemRoles();
  recordEvent({
    category: 'system',
    action: 'system.started',
    severity: indexes.failed.length > 0 ? 'warn' : 'info',
    message: 'API started',
    metadata: {
      hostname: process.env.HOSTNAME ?? null,
      node: process.version,
      indexedModels: indexes.models,
      indexFailures: indexes.failed,
      sickLeaveMigration: migrated,
    },
  });
  const server = createServer(app);
  const stopDailyAttendance = startDailyAttendanceScheduler(logger);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Gnomon API listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down Gnomon API');
    stopDailyAttendance();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((error: unknown) => {
  logger.fatal({ error }, 'Failed to start Gnomon API');
  process.exit(1);
});
