import type { SmtpSecurity } from '@gnomon/shared';
import { model, Schema, type Types } from 'mongoose';

export interface SmtpSettingsDocument {
  _id: Types.ObjectId;
  /** Singleton key; there is exactly one SMTP configuration. */
  key: 'smtp';
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  /** AES-GCM sealed; never returned by the API. */
  passwordSealed: string | null;
  allowSelfSignedCertificate: boolean;
  fromName: string;
  fromAddress: string;
  replyTo: string | null;
  updatedByUserId: Types.ObjectId | null;
  lastTest: { at: Date; ok: boolean; message: string; recipient: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const smtpSettingsSchema = new Schema<SmtpSettingsDocument>(
  {
    key: { type: String, enum: ['smtp'], required: true, default: 'smtp' },
    enabled: { type: Boolean, required: true, default: false },
    host: { type: String, required: true, trim: true, maxlength: 253 },
    port: { type: Number, required: true, min: 1, max: 65_535 },
    security: { type: String, enum: ['starttls', 'ssl', 'none'], required: true },
    username: { type: String, default: '', trim: true, maxlength: 254 },
    passwordSealed: { type: String, default: null, select: false },
    allowSelfSignedCertificate: { type: Boolean, required: true, default: false },
    fromName: { type: String, required: true, trim: true, maxlength: 120 },
    fromAddress: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    replyTo: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastTest: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          ok: { type: Boolean, required: true },
          message: { type: String, required: true, maxlength: 500 },
          recipient: { type: String, required: true, maxlength: 254 },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

smtpSettingsSchema.index({ key: 1 }, { unique: true });

export const SmtpSettings = model<SmtpSettingsDocument>('SmtpSettings', smtpSettingsSchema);
