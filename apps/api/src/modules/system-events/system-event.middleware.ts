import { randomUUID } from 'node:crypto';

import type { SystemEventParty, SystemEventSeverity } from '@gnomon/shared';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, RequestHandler } from 'express';

import { requestContextStorage, type RequestContext } from './request-context.js';
import { matchRoute } from './route-catalog.js';
import { recordEvent } from './system-event.service.js';

const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Request ID for pino-http: re-use a well-formed incoming X-Request-Id (from the
 * ingress) or create one, and echo it so the UI can show it on errors.
 */
export function generateRequestId(request: IncomingMessage, response: ServerResponse): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  response.setHeader('X-Request-Id', id);
  return id;
}

/** Whether a finished request is worth an event: changes and failures, not polling. */
export function shouldRecord(
  method: string,
  path: string,
  status: number,
  quietOnSuccess: boolean,
): boolean {
  if (!path.startsWith('/api/') || path.startsWith('/api/v1/health')) return false;
  const failed = status >= 400;
  if (path === '/api/v1/auth/refresh') return status >= 500;
  // Expired access tokens are refreshed transparently by the web app.
  if (status === 401 && path !== '/api/v1/auth/login') return false;
  if (MUTATING.has(method)) return failed || !quietOnSuccess;
  return failed;
}

function severityFor(status: number): SystemEventSeverity {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

function subjectFor(
  context: RequestContext,
  routeSubject: { type: string; id: string } | null,
): SystemEventParty | null {
  if (context.subject) return context.subject;
  if (!routeSubject) return null;
  const isEmployeeCode = routeSubject.type === 'employee' && !OBJECT_ID.test(routeSubject.id);
  return {
    type: routeSubject.type,
    id: isEmployeeCode ? null : routeSubject.id,
    employeeCode: isEmployeeCode ? routeSubject.id.toUpperCase() : null,
    label: null,
  };
}

function capturedFields(request: Request, fields: string[]): Record<string, unknown> | null {
  if (fields.length === 0 || !request.body || typeof request.body !== 'object') return null;
  const body = request.body as Record<string, unknown>;
  const picked = Object.fromEntries(
    fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
  );
  return Object.keys(picked).length > 0 ? picked : null;
}

/**
 * Opens the per-request context (actor, subject, error) and records one system
 * event when the response finishes, for every change request and every failure.
 */
export const systemEventMiddleware: RequestHandler = (request, response, next) => {
  const path = request.originalUrl.split('?')[0] ?? request.originalUrl;
  const context: RequestContext = {
    requestId: String(request.id ?? response.getHeader('X-Request-Id') ?? randomUUID()),
    startedAt: performance.now(),
    method: request.method,
    path,
    ip: request.ip ?? null,
    userAgent: request.get('user-agent')?.slice(0, 300) ?? null,
    actor: null,
    subject: null,
    category: null,
    action: null,
    message: null,
    metadata: null,
    error: null,
    skip: false,
  };

  response.on('finish', () => {
    const route = matchRoute(context.method, context.path);
    const status = response.statusCode;
    if (context.skip || !shouldRecord(context.method, context.path, status, route.quietOnSuccess)) {
      return;
    }
    const failed = status >= 400;
    const baseMessage = context.message ?? route.message;
    const metadata = {
      ...(capturedFields(request, route.capture) ?? {}),
      ...(context.metadata ?? {}),
      ...(context.error?.stack ? { stack: context.error.stack } : {}),
    };
    recordEvent({
      category: context.category ?? route.category,
      action: context.action ?? route.action,
      severity: severityFor(status),
      outcome: failed ? 'failure' : 'success',
      message: failed
        ? `${baseMessage} failed: ${context.error?.message ?? `HTTP ${status}`}`
        : baseMessage,
      errorCode: context.error?.code ?? null,
      requestId: context.requestId,
      actor: context.actor,
      subject: subjectFor(context, route.subject),
      request: {
        method: context.method,
        path: context.path.slice(0, 500),
        route: route.route,
        status,
        durationMs: Math.round(performance.now() - context.startedAt),
        ip: context.ip,
        userAgent: context.userAgent,
      },
      metadata,
    });
  });

  requestContextStorage.run(context, () => next());
};
