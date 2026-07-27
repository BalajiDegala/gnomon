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

  it('requires authentication for shows and timesheets', async () => {
    const [shows, timesheets, reconciliation, regularisations, approvals] = await Promise.all([
      request(app).get('/api/v1/shows'),
      request(app).get('/api/v1/timesheets'),
      request(app).get('/api/v1/reconciliation'),
      request(app).get('/api/v1/regularisations/mine'),
      request(app).get('/api/v1/approvals/regularisations'),
    ]);

    expect(shows.status).toBe(401);
    expect(timesheets.status).toBe(401);
    expect(reconciliation.status).toBe(401);
    expect(regularisations.status).toBe(401);
    expect(approvals.status).toBe(401);
    expect(shows.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(timesheets.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(reconciliation.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(regularisations.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(approvals.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
