import type {
  SystemEventCategory,
  SystemEventOutcome,
  SystemEventParty,
  SystemEventRequest,
  SystemEventSeverity,
} from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface SystemEventDocument {
  _id: Types.ObjectId;
  createdAt: Date;
  /** TTL: MongoDB deletes the event after this time. */
  expiresAt: Date;
  category: SystemEventCategory;
  action: string;
  severity: SystemEventSeverity;
  outcome: SystemEventOutcome;
  message: string;
  errorCode: string | null;
  requestId: string | null;
  actor: SystemEventParty | null;
  subject: SystemEventParty | null;
  request: SystemEventRequest | null;
  metadata: Record<string, unknown> | null;
}

const partySchema = new Schema<SystemEventParty>(
  {
    type: { type: String, required: true },
    id: { type: String, default: null },
    employeeCode: { type: String, default: null },
    label: { type: String, default: null },
  },
  { _id: false },
);

const requestSchema = new Schema<SystemEventRequest>(
  {
    method: { type: String, required: true },
    path: { type: String, required: true },
    route: { type: String, default: null },
    status: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { _id: false },
);

const systemEventSchema = new Schema<SystemEventDocument>(
  {
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    category: { type: String, required: true },
    action: { type: String, required: true },
    severity: { type: String, enum: ['info', 'warn', 'error'], required: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    message: { type: String, required: true },
    errorCode: { type: String, default: null },
    requestId: { type: String, default: null },
    actor: { type: partySchema, default: null },
    subject: { type: partySchema, default: null },
    request: { type: requestSchema, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { collection: 'system_events', versionKey: false },
);

systemEventSchema.index({ createdAt: -1, _id: -1 });
systemEventSchema.index({ category: 1, createdAt: -1, _id: -1 });
systemEventSchema.index({ severity: 1, createdAt: -1, _id: -1 });
systemEventSchema.index({ 'actor.employeeCode': 1, createdAt: -1, _id: -1 });
systemEventSchema.index({ 'subject.employeeCode': 1, createdAt: -1, _id: -1 });
systemEventSchema.index({ requestId: 1 });
systemEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SystemEvent = model<SystemEventDocument>('SystemEvent', systemEventSchema);
