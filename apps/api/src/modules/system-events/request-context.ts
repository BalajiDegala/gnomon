import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuthUser, SystemEventCategory, SystemEventParty } from '@gnomon/shared';

/** Per-request state used to build the request's system event. */
export interface RequestContext {
  requestId: string;
  startedAt: number;
  method: string;
  path: string;
  ip: string | null;
  userAgent: string | null;
  actor: SystemEventParty | null;
  subject: SystemEventParty | null;
  category: SystemEventCategory | null;
  action: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  error: { code: string; message: string; stack: string | null } | null;
  /** Set to drop the automatic request event (e.g. when a handler recorded its own). */
  skip: boolean;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function actorFromAuthUser(user: AuthUser): SystemEventParty {
  return {
    type: 'user',
    id: user.id,
    employeeCode: user.employeeCode,
    label: user.displayName,
  };
}

export function setEventActor(user: AuthUser | SystemEventParty): void {
  const context = getRequestContext();
  if (context) context.actor = 'permissions' in user ? actorFromAuthUser(user) : user;
}

/**
 * Add detail to the event recorded for the current request. Metadata is merged;
 * other fields replace earlier values. A no-op outside a request.
 */
export function describeEvent(
  detail: Partial<
    Pick<RequestContext, 'subject' | 'category' | 'action' | 'message' | 'metadata' | 'skip'>
  >,
): void {
  const context = getRequestContext();
  if (!context) return;
  const { metadata, ...rest } = detail;
  Object.assign(context, rest);
  if (metadata) context.metadata = { ...(context.metadata ?? {}), ...metadata };
}

export function noteRequestError(code: string, message: string, stack: string | null): void {
  const context = getRequestContext();
  if (context) context.error = { code, message, stack };
}
