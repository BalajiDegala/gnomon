import { model, Schema, type Types } from 'mongoose';

export interface LdapSettingsDocument {
  _id: Types.ObjectId;
  /** Singleton key; there is exactly one directory configuration. */
  key: 'ldap';
  enabled: boolean;
  url: string;
  startTls: boolean;
  allowSelfSignedCertificate: boolean;
  bindDn: string;
  /** AES-GCM sealed; never returned by the API. */
  bindPasswordSealed: string | null;
  baseDn: string;
  userFilter: string;
  attributes: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    department: string;
    designation: string;
    employeeId: string;
  };
  autoCreateUsers: boolean;
  notifyAdmins: boolean;
  updatedByUserId: Types.ObjectId | null;
  lastTest: { at: Date; ok: boolean; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const ldapSettingsSchema = new Schema<LdapSettingsDocument>(
  {
    key: { type: String, enum: ['ldap'], required: true, default: 'ldap', unique: true },
    enabled: { type: Boolean, required: true, default: false },
    url: { type: String, required: true, trim: true, maxlength: 300 },
    startTls: { type: Boolean, required: true, default: false },
    allowSelfSignedCertificate: { type: Boolean, required: true, default: false },
    bindDn: { type: String, default: '', trim: true, maxlength: 512 },
    bindPasswordSealed: { type: String, default: null, select: false },
    baseDn: { type: String, required: true, trim: true, maxlength: 512 },
    userFilter: { type: String, required: true, trim: true, maxlength: 1_000 },
    attributes: {
      username: { type: String, required: true },
      email: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      displayName: { type: String, default: '' },
      department: { type: String, default: '' },
      designation: { type: String, default: '' },
      employeeId: { type: String, default: '' },
    },
    autoCreateUsers: { type: Boolean, required: true, default: true },
    notifyAdmins: { type: Boolean, required: true, default: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastTest: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          ok: { type: Boolean, required: true },
          message: { type: String, required: true, maxlength: 500 },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

export const LdapSettings = model<LdapSettingsDocument>('LdapSettings', ldapSettingsSchema);
