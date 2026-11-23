import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recorded = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('../src/modules/system-events/system-event.service.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/modules/system-events/system-event.service.js')>();
  return {
    ...original,
    recordEvent: (input: Record<string, unknown>) => {
      recorded.push(input);
    },
  };
});

const { app } = await import('../src/app.js');
const { matchRoute } = await import('../src/modules/system-events/route-catalog.js');
const { shouldRecord } = await import('../src/modules/system-events/system-event.middleware.js');
const { sanitizeMetadata } = await import('../src/modules/system-events/system-event.service.js');

describe('route catalog', () => {
  it('names known routes and extracts the subject', () => {
    expect(matchRoute('POST', '/api/v1/leaves/6afe960c9c8c7ed444e452a9/cancel')).toMatchObject({
      category: 'leave',
      action: 'leave.cancelled',
      subject: { type: 'leave_request', id: '6afe960c9c8c7ed444e452a9' },
    });
    expect(matchRoute('PUT', '/api/v1/administration/leave-balances/DDIH005')).toMatchObject({
      action: 'admin.leave_balance_updated',
      subject: { type: 'employee', id: 'DDIH005' },
      capture: ['leaveType', 'year', 'entitledDays', 'adjustedDays'],
    });
    expect(matchRoute('POST', '/api/v1/timecard/start').action).toBe('timecard.start');
  });

  it('falls back to a category from the path for unlisted routes', () => {
    expect(matchRoute('GET', '/api/v1/administration/security/directory')).toMatchObject({
      route: null,
      category: 'security',
      action: 'http.get',
    });
    expect(matchRoute('GET', '/api/v1/unknown').category).toBe('system');
  });
});

describe('shouldRecord', () => {
  it('records changes and failures but not polling or token refresh', () => {
    expect(shouldRecord('POST', '/api/v1/timecard/start', 200, false)).toBe(true);
    expect(shouldRecord('GET', '/api/v1/notifications', 200, false)).toBe(false);
    expect(shouldRecord('GET', '/api/v1/calendar', 500, false)).toBe(true);
    expect(shouldRecord('GET', '/api/v1/reports/workforce', 403, false)).toBe(true);
    expect(shouldRecord('POST', '/api/v1/auth/refresh', 200, true)).toBe(false);
    expect(shouldRecord('POST', '/api/v1/auth/refresh', 401, true)).toBe(false);
    expect(shouldRecord('POST', '/api/v1/notifications/read-all', 200, true)).toBe(false);
    expect(shouldRecord('GET', '/api/v1/health/ready', 503, false)).toBe(false);
  });

  it('keeps failed sign-ins but drops expired-token 401s elsewhere', () => {
    expect(shouldRecord('POST', '/api/v1/auth/login', 401, false)).toBe(true);
    expect(shouldRecord('GET', '/api/v1/timecard/today', 401, false)).toBe(false);
    expect(shouldRecord('POST', '/api/v1/timecard/stop', 401, false)).toBe(false);
  });
});

describe('sanitizeMetadata', () => {
  it('redacts secrets at any depth and bounds arrays and strings', () => {
    const clean = sanitizeMetadata({
      password: 'hunter2',
      nested: { accessToken: 'abc', smtpPassword: 'x', host: 'mail' },
      rows: Array.from({ length: 60 }, (_, index) => index),
      note: 'y'.repeat(3_000),
    }) as Record<string, unknown>;
    expect(clean.password).toBe('[REDACTED]');
    expect(clean.nested).toEqual({
      accessToken: '[REDACTED]',
      smtpPassword: '[REDACTED]',
      host: 'mail',
    });
    expect((clean.rows as unknown[]).length).toBe(51);
    expect((clean.note as string).length).toBeLessThan(2_010);
  });
});

describe('sanitizeMetadata with document-like objects', () => {
  it('stores the plain JSON form, not internals', () => {
    const subdocument = {
      $__: { internal: true },
      _doc: { ipAddress: '10.0.0.1' },
      toJSON: () => ({ ipAddress: '10.0.0.1', userAgent: 'x' }),
    };
    expect(sanitizeMetadata({ startedFrom: subdocument })).toEqual({
      startedFrom: { ipAddress: '10.0.0.1', userAgent: 'x' },
    });
  });
});

describe('system event middleware', () => {
  beforeEach(() => {
    recorded.length = 0;
  });

  it('returns a request ID and re-uses a well-formed incoming one', async () => {
    const generated = await request(app).get('/api/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const forwarded = await request(app)
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'ingress-req-12345');
    expect(forwarded.headers['x-request-id']).toBe('ingress-req-12345');
  });

  it('records a rejected sign-in with its error code and request ID', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({ userId: 'x' });
    expect(response.status).toBe(400);
    await vi.waitFor(() => expect(recorded).toHaveLength(1));
    expect(recorded[0]).toMatchObject({
      category: 'auth',
      action: 'auth.login',
      severity: 'warn',
      outcome: 'failure',
      errorCode: 'VALIDATION_ERROR',
      requestId: response.headers['x-request-id'],
      request: { method: 'POST', path: '/api/v1/auth/login', status: 400 },
    });
    expect(JSON.stringify(recorded[0])).not.toContain('password');
  });

  it('does not record unauthenticated reads or expired-token calls', async () => {
    await request(app).get('/api/v1/reports/events');
    await request(app).post('/api/v1/timecard/stop');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recorded).toHaveLength(0);
  });
});
