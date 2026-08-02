import { model, Schema } from 'mongoose';

const securityAuditEventSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['account_provisioned', 'account_updated', 'role_assigned', 'role_revoked'],
      required: true,
    },
    details: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, immutable: true },
);

securityAuditEventSchema.index({ targetUserId: 1, createdAt: -1 });
securityAuditEventSchema.index({ actorUserId: 1, createdAt: -1 });

export const SecurityAuditEvent = model('SecurityAuditEvent', securityAuditEventSchema);
