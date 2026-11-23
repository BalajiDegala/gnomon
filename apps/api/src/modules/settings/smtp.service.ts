import {
  gmailSmtpDefaults,
  type SmtpSettingsDto,
  type UpdateSmtpSettingsRequest,
  UpdateSmtpSettingsRequestSchema,
} from '@gnomon/shared';
import nodemailer, { type Transporter } from 'nodemailer';
import { Types } from 'mongoose';
import pino from 'pino';

import { HttpError } from '../../middleware/errors.js';
import { User } from '../auth/user.model.js';
import { Employee } from '../employees/employee.model.js';
import { openSecret, sealSecret } from './secret-box.js';
import { SmtpSettings, type SmtpSettingsDocument } from './smtp-settings.model.js';

const logger = pino({ name: 'mailer' });

/* ---------------------------------------------------------------- settings */

async function loadSettings(withPassword = false) {
  const query = SmtpSettings.findOne({ key: 'smtp' });
  if (withPassword) query.select('+passwordSealed');
  return query.exec();
}

async function updatedByName(userId: Types.ObjectId | null): Promise<string | null> {
  if (!userId) return null;
  const user = await User.findById(userId).select({ employeeId: 1, email: 1 }).lean().exec();
  if (!user) return null;
  const employee = await Employee.findById(user.employeeId)
    .select({ firstName: 1, lastName: 1, hrProfile: 1 })
    .lean()
    .exec();
  return (
    employee?.hrProfile?.fullName ??
    (employee ? `${employee.firstName} ${employee.lastName}`.trim() : user.email)
  );
}

async function toDto(settings: SmtpSettingsDocument | null): Promise<SmtpSettingsDto> {
  if (!settings) {
    // Nothing saved yet: offer the Gmail defaults with sending switched off.
    return {
      configured: false,
      enabled: false,
      ...gmailSmtpDefaults,
      username: '',
      hasPassword: false,
      passwordNeedsReentry: false,
      allowSelfSignedCertificate: false,
      fromName: 'Gnomon',
      fromAddress: '',
      replyTo: null,
      updatedAt: null,
      updatedByName: null,
      lastTest: null,
    };
  }
  const sealed = settings.passwordSealed;
  return {
    configured: true,
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    security: settings.security,
    username: settings.username,
    hasPassword: Boolean(sealed),
    passwordNeedsReentry: Boolean(sealed) && openSecret(sealed!) === null,
    allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
    fromName: settings.fromName,
    fromAddress: settings.fromAddress,
    replyTo: settings.replyTo,
    updatedAt: settings.updatedAt.toISOString(),
    updatedByName: await updatedByName(settings.updatedByUserId),
    lastTest: settings.lastTest
      ? {
          at: settings.lastTest.at.toISOString(),
          ok: settings.lastTest.ok,
          message: settings.lastTest.message,
          recipient: settings.lastTest.recipient,
        }
      : null,
  };
}

export async function getSmtpSettings(): Promise<SmtpSettingsDto> {
  return toDto(await loadSettings(true));
}

export async function updateSmtpSettings(
  userId: string,
  input: UpdateSmtpSettingsRequest,
): Promise<SmtpSettingsDto> {
  const parsed = UpdateSmtpSettingsRequestSchema.parse(input);
  const existing = await loadSettings(true);
  const passwordSealed =
    parsed.password === undefined
      ? (existing?.passwordSealed ?? null)
      : parsed.password === ''
        ? null
        : sealSecret(parsed.password);

  if (parsed.enabled && parsed.username && !passwordSealed) {
    throw new HttpError(
      400,
      'Enter the SMTP password before enabling email',
      'SMTP_PASSWORD_REQUIRED',
    );
  }

  await SmtpSettings.findOneAndUpdate(
    { key: 'smtp' },
    {
      $set: {
        enabled: parsed.enabled,
        host: parsed.host.toLowerCase(),
        port: parsed.port,
        security: parsed.security,
        username: parsed.username,
        passwordSealed,
        allowSelfSignedCertificate: parsed.allowSelfSignedCertificate,
        fromName: parsed.fromName,
        fromAddress: parsed.fromAddress,
        replyTo: parsed.replyTo,
        updatedByUserId: new Types.ObjectId(userId),
      },
      $setOnInsert: { key: 'smtp' },
    },
    { upsert: true, runValidators: true },
  ).exec();
  cachedTransport = null;
  return getSmtpSettings();
}

/* --------------------------------------------------------------- transport */

let cachedTransport: { version: string; transporter: Transporter } | null = null;

function createTransport(settings: SmtpSettingsDocument): Transporter {
  const password = settings.passwordSealed ? openSecret(settings.passwordSealed) : null;
  if (settings.passwordSealed && password === null) {
    throw new HttpError(
      409,
      'The saved SMTP password can no longer be read. Re-enter it in Site preferences.',
      'SMTP_PASSWORD_UNREADABLE',
    );
  }
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'ssl',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    auth: settings.username ? { user: settings.username, pass: password ?? '' } : undefined,
    tls: { rejectUnauthorized: !settings.allowSelfSignedCertificate },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function transportFor(settings: SmtpSettingsDocument): Promise<Transporter> {
  const version = settings.updatedAt.toISOString();
  if (cachedTransport?.version !== version) {
    cachedTransport?.transporter.close();
    cachedTransport = { version, transporter: createTransport(settings) };
  }
  return cachedTransport.transporter;
}

/** Turns SMTP errors into guidance an administrator can act on. */
export function describeSmtpError(error: unknown, host: string): string {
  const err = error as { code?: string; responseCode?: number; message?: string };
  if (err.code === 'EAUTH' || err.responseCode === 535) {
    return host.endsWith('gmail.com')
      ? 'Gmail rejected the username or password. Use a Gmail App Password, not the account password.'
      : 'The SMTP server rejected the username or password.';
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET') {
    return `Could not reach ${host}. Check the server name, port, security setting and firewall.`;
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EDNS') return `The server ${host} was not found.`;
  if (/self[- ]signed|certificate/i.test(err.message ?? '')) {
    return 'The server certificate is not trusted. For an internal server with a self-signed certificate, allow it in the settings.';
  }
  return (err.message ?? 'Sending failed').slice(0, 300);
}

/* ------------------------------------------------------------------- send */

export interface OutgoingMail {
  to: string | string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
}

export type SendResult = { sent: true; messageId: string } | { sent: false; reason: string };

/**
 * Sends one email using the Site preferences SMTP settings. Mail triggers
 * call this; it never throws, so a mail outage cannot break the action that
 * triggered the email. Failures are logged.
 */
export async function sendMail(mail: OutgoingMail): Promise<SendResult> {
  const settings = await loadSettings(true);
  if (!settings?.enabled) return { sent: false, reason: 'Email is not enabled' };
  try {
    const transporter = await transportFor(settings);
    const info = await transporter.sendMail({
      from: { name: settings.fromName, address: settings.fromAddress },
      replyTo: settings.replyTo ?? undefined,
      to: mail.to,
      cc: mail.cc?.length ? mail.cc : undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    const reason = describeSmtpError(error, settings.host);
    logger.warn({ reason, subject: mail.subject }, 'Email delivery failed');
    return { sent: false, reason };
  }
}

/** Sends a test message with the saved settings (even when disabled) and records the result. */
export async function sendTestEmail(to: string): Promise<SmtpSettingsDto> {
  const settings = await loadSettings(true);
  if (!settings) {
    throw new HttpError(400, 'Save the SMTP settings before sending a test', 'SMTP_NOT_CONFIGURED');
  }
  let result: { ok: boolean; message: string };
  try {
    const transporter = createTransport(settings);
    try {
      await transporter.verify();
      await transporter.sendMail({
        from: { name: settings.fromName, address: settings.fromAddress },
        replyTo: settings.replyTo ?? undefined,
        to,
        subject: 'Gnomon test email',
        text: `This is a test email from Gnomon.\n\nIf you received it, email is set up correctly (server ${settings.host}:${settings.port}).`,
      });
    } finally {
      transporter.close();
    }
    result = { ok: true, message: `Test email sent to ${to}` };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    result = { ok: false, message: describeSmtpError(error, settings.host) };
  }
  await SmtpSettings.updateOne(
    { key: 'smtp' },
    { $set: { lastTest: { at: new Date(), recipient: to, ...result } } },
    { timestamps: false },
  ).exec();
  return getSmtpSettings();
}
