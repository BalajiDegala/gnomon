import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app.js';

describe('health routes', () => {
  it('reports the process as live without requiring the database', async () => {
    const response = await request(app).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not report ready while the database is disconnected', async () => {
    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'down' },
    });
  });
});

describe('protected routes', () => {
  it('requires authentication for the employee timecard', async () => {
    const response = await request(app).get('/api/v1/timecard/today');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('requires authentication for attendance import history', async () => {
    const response = await request(app).get('/api/v1/imports');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
