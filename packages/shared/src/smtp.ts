import { z } from 'zod';

export const SmtpSecuritySchema = z.enum(['starttls', 'ssl', 'none']);
export type SmtpSecurity = z.infer<typeof SmtpSecuritySchema>;

/** Gmail defaults. Gmail requires an App Password (Google account → Security → App passwords). */
export const gmailSmtpDefaults = {
  host: 'smtp.gmail.com',
  port: 587,
  security: 'starttls' as SmtpSecurity,
};

export const SmtpTestResultSchema = z.object({
  at: z.string().datetime(),
  ok: z.boolean(),
  message: z.string(),
  recipient: z.string(),
});
export type SmtpTestResult = z.infer<typeof SmtpTestResultSchema>;

/** Never contains the password; `hasPassword` says whether one is stored. */
export const SmtpSettingsDtoSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  host: z.string(),
  port: z.number().int(),
  security: SmtpSecuritySchema,
  username: z.string(),
  hasPassword: z.boolean(),
  /** The stored password could not be decrypted (encryption key changed); re-enter it. */
  passwordNeedsReentry: z.boolean(),
  allowSelfSignedCertificate: z.boolean(),
  fromName: z.string(),
  fromAddress: z.string(),
  replyTo: z.string().nullable(),
  updatedAt: z.string().datetime().nullable(),
  updatedByName: z.string().nullable(),
  lastTest: SmtpTestResultSchema.nullable(),
});
export type SmtpSettingsDto = z.infer<typeof SmtpSettingsDtoSchema>;

const hostname = z
  .string()
  .trim()
  .min(1, 'Enter the SMTP server')
  .max(253)
  .regex(/^[a-z0-9.-]+$|^\[?[0-9a-f:.]+\]?$/i, 'Use a host name or IP address');

export const UpdateSmtpSettingsRequestSchema = z.object({
  enabled: z.boolean(),
  host: hostname,
  port: z.number().int().min(1).max(65_535),
  security: SmtpSecuritySchema,
  username: z.string().trim().max(254),
  /** Omit to keep the stored password; empty string removes it. */
  password: z.string().max(512).optional(),
  allowSelfSignedCertificate: z.boolean().default(false),
  fromName: z.string().trim().min(1, 'Enter a sender name').max(120),
  fromAddress: z.string().trim().toLowerCase().email('Enter a valid sender address'),
  replyTo: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid reply-to address')
    .nullable()
    .or(z.literal('').transform(() => null)),
});
export type UpdateSmtpSettingsRequest = z.input<typeof UpdateSmtpSettingsRequestSchema>;

export const SendTestEmailRequestSchema = z.object({
  to: z.string().trim().toLowerCase().email('Enter a valid email address'),
});
export type SendTestEmailRequest = z.infer<typeof SendTestEmailRequestSchema>;
