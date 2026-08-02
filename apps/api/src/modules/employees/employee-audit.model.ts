import { model, Schema } from 'mongoose';

const employeeAuditEventSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['created', 'updated'], required: true },
    changes: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, immutable: true },
);

employeeAuditEventSchema.index({ employeeId: 1, createdAt: -1 });
employeeAuditEventSchema.index({ actorUserId: 1, createdAt: -1 });

export const EmployeeAuditEvent = model('EmployeeAuditEvent', employeeAuditEventSchema);
