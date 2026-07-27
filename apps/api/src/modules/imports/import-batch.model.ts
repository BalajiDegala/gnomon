import type {
  AttendanceImportErrorDto,
  AttendanceImportSource,
  AttendanceImportStatus,
} from '@gnomon/shared';
import { model, Schema, Types, type HydratedDocument } from 'mongoose';

export interface ImportBatchDocument {
  _id: Types.ObjectId;
  source: AttendanceImportSource;
  importType: 'csv';
  fileName: string;
  fileHash: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
  status: AttendanceImportStatus;
  importedBy: Types.ObjectId;
  errors: AttendanceImportErrorDto[];
  errorsTruncated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ImportBatchRecord = HydratedDocument<ImportBatchDocument>;

const importErrorSchema = new Schema<AttendanceImportErrorDto>(
  {
    rowNumber: { type: Number, required: true, min: 1 },
    employeeCode: { type: String, required: true, default: '' },
    reason: { type: String, required: true },
  },
  { _id: false },
);

const importBatchSchema = new Schema<ImportBatchDocument>(
  {
    source: { type: String, enum: ['biometric', 'access_card'], required: true },
    importType: { type: String, enum: ['csv'], required: true, default: 'csv' },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    fileHash: { type: String, required: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    totalRows: { type: Number, required: true, min: 0, default: 0 },
    successfulRows: { type: Number, required: true, min: 0, default: 0 },
    failedRows: { type: Number, required: true, min: 0, default: 0 },
    duplicateRows: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['processing', 'completed', 'partial', 'failed'],
      required: true,
      default: 'processing',
    },
    importedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    errors: { type: [importErrorSchema], default: [] },
    errorsTruncated: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, suppressReservedKeysWarning: true },
);

importBatchSchema.index({ source: 1, fileHash: 1 }, { unique: true });
importBatchSchema.index({ createdAt: -1 });

export const ImportBatch = model<ImportBatchDocument>('ImportBatch', importBatchSchema);
