import { Router } from 'express';

import { isDatabaseReady } from '../db/mongoose.js';

export const healthRouter = Router();

healthRouter.get('/live', (_request, response) => {
  response.json({ status: 'ok' });
});

healthRouter.get('/ready', (_request, response) => {
  const databaseReady = isDatabaseReady();
  response.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ready' : 'not_ready',
    checks: { database: databaseReady ? 'up' : 'down' },
  });
});
