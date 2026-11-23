import type {
  SystemEventCategory,
  SystemEventDto,
  SystemEventListResponse,
  SystemEventOutcome,
  SystemEventParty,
  SystemEventQuery,
  SystemEventRequest,
  SystemEventSeverity,
} from '@gnomon/shared';
import { Types, type QueryFilter } from 'mongoose';
import pino from 'pino';

import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/errors.js';
import { getRequestContext } from './request-context.js';
import { SystemEvent, type SystemEventDocument } from './system-event.model.js';

const logger = pino({ name: 'system-events' });
const DAY_MS = 86_400_000;
const MAX_METADATA_JSON = 16_384;
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|hash|api[-_]?key|credential/i;
/** Without an explicit start, free-text search is limited to recent events. */
const DEFAULT_SEARCH_WINDOW_MS = 31 * DAY_MS;

export interface RecordEventInput {
  category: SystemEventCategory;
  action: string;
  message: string;
  severity?: SystemEventSeverity;
  outcome?: SystemEventOutcome;
  errorCode?: string | null;
  actor?: SystemEventParty | null;
  subject?: SystemEventParty | null;
  request?: SystemEventRequest | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
}

/** Remove secrets and bound the size of event metadata. */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return String(value);
  if (depth >= 6) return '[nested]';
  // Mongoose documents/subdocuments and similar objects: use their plain form.
  const withToJson = value as { toJSON?: () => unknown };
  if (typeof value === 'object' && typeof withToJson.toJSON === 'function') {
    return sanitizeMetadata(withToJson.toJSON(), depth + 1);
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
    return value.length > 50 ? [...items, `… ${value.length - 50} more`] : items;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeMetadata(item, depth + 1),
        ]),
    );
  }
  return String(value);
}

function boundedMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  const clean = sanitizeMetadata(metadata) as Record<string, unknown>;
  const json = JSON.stringify(clean);
  return json.length > MAX_METADATA_JSON
    ? { truncated: true, preview: json.slice(0, 4_000) }
    : clean;
}

/**
 * Store one event. Never throws and never delays the caller: a failed write is
 * only logged. Request ID and actor are taken from the current request when
 * not given.
 */
export function recordEvent(input: RecordEventInput): void {
  if (!env.SYSTEM_EVENTS_ENABLED) return;
  const context = getRequestContext();
  const now = new Date();
  const document: Omit<SystemEventDocument, '_id'> = {
    createdAt: now,
    expiresAt: new Date(now.getTime() + env.SYSTEM_EVENT_RETENTION_DAYS * DAY_MS),
    category: input.category,
    action: input.action.slice(0, 120),
    severity: input.severity ?? 'info',
    outcome: input.outcome ?? 'success',
    message: input.message.slice(0, 1_000),
    errorCode: input.errorCode ?? null,
    requestId: input.requestId ?? context?.requestId ?? null,
    actor: input.actor ?? context?.actor ?? null,
    subject: input.subject ?? null,
    request: input.request ?? null,
    metadata: boundedMetadata(input.metadata),
  };
  void SystemEvent.collection.insertOne(document).catch((error: unknown) => {
    logger.warn({ error, action: document.action }, 'Failed to record system event');
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toDto(event: SystemEventDocument, includeMetadata: boolean): SystemEventDto {
  return {
    id: String(event._id),
    createdAt: event.createdAt.toISOString(),
    category: event.category,
    action: event.action,
    severity: event.severity,
    outcome: event.outcome,
    message: event.message,
    errorCode: event.errorCode ?? null,
    requestId: event.requestId ?? null,
    actor: event.actor ?? null,
    subject: event.subject ?? null,
    request: event.request ?? null,
    ...(includeMetadata ? { metadata: event.metadata ?? {} } : {}),
  };
}

export async function listSystemEvents(query: SystemEventQuery): Promise<SystemEventListResponse> {
  const filter: QueryFilter<SystemEventDocument> = {};
  const createdAt: { $gte?: Date; $lte?: Date } = {};
  if (query.from) createdAt.$gte = new Date(query.from);
  else if (query.q) createdAt.$gte = new Date(Date.now() - DEFAULT_SEARCH_WINDOW_MS);
  if (query.to) createdAt.$lte = new Date(query.to);
  if (createdAt.$gte || createdAt.$lte) filter.createdAt = createdAt;
  if (query.category?.length) filter.category = { $in: query.category };
  if (query.severity?.length) filter.severity = { $in: query.severity };
  if (query.outcome) filter.outcome = query.outcome;
  if (query.requestId) filter.requestId = query.requestId;

  const and: QueryFilter<SystemEventDocument>[] = [];
  if (query.employeeCode) {
    and.push({
      $or: [
        { 'actor.employeeCode': query.employeeCode },
        { 'subject.employeeCode': query.employeeCode },
      ],
    });
  }
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    and.push({
      $or: [
        { message: pattern },
        { requestId: pattern },
        { action: pattern },
        { errorCode: pattern },
        { 'request.path': pattern },
        { 'actor.label': pattern },
        { 'actor.employeeCode': pattern },
        { 'subject.label': pattern },
        { 'subject.employeeCode': pattern },
        { 'subject.id': pattern },
      ],
    });
  }
  if (query.cursor) {
    const [millis, id] = query.cursor.split('.');
    const at = new Date(Number(millis));
    and.push({
      $or: [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: new Types.ObjectId(id) } }],
    });
  }
  if (and.length > 0) filter.$and = and;

  const events = await SystemEvent.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .select({ metadata: 0 })
    .lean<SystemEventDocument[]>()
    .exec();
  const page = events.slice(0, query.limit);
  const last = page.at(-1);
  return {
    events: page.map((event) => toDto(event, false)),
    nextCursor:
      events.length > query.limit && last
        ? `${last.createdAt.getTime()}.${String(last._id)}`
        : null,
  };
}

export async function getSystemEvent(eventId: string): Promise<SystemEventDto> {
  if (!Types.ObjectId.isValid(eventId)) {
    throw new HttpError(404, 'Event not found', 'EVENT_NOT_FOUND');
  }
  const event = await SystemEvent.findById(eventId).lean<SystemEventDocument>().exec();
  if (!event) throw new HttpError(404, 'Event not found', 'EVENT_NOT_FOUND');
  return toDto(event, true);
}
