import { model, Schema } from 'mongoose';

const changeSchema = new Schema(
  {
    action: { type: String, enum: ['delete', 'replace'], required: true },
    source: { type: String, required: true },
    batchId: { type: Schema.Types.ObjectId, default: null },
    from: { type: String, default: null },
    to: { type: String, default: null },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    removedEvents: { type: Number, required: true },
    status: {
      type: String,
      enum: ['applying', 'completed', 'rolled_back', 'recovery_required'],
      default: 'applying',
    },
    // Only batch metadata is backed up here; punches are retained individually.
    previousBatches: { type: [Schema.Types.Mixed], default: [] },
    replacementBatchId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

export const AttendanceImportChange = model('AttendanceImportChange', changeSchema);
