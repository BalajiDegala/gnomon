import { createServer } from 'node:http';

import pino from 'pino';

import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/mongoose.js';

const logger = pino();

async function start(): Promise<void> {
  await connectDatabase();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Gnomon API listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down Gnomon API');
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
