import {
  defaultLdapAttributes,
  defaultLdapUserFilter,
  UpdateLdapSettingsRequestSchema,
  type LdapSettingsDto,
  type TestLdapRequest,
  type UpdateLdapSettingsRequest,
} from '@gnomon/shared';
import { Client, Filter, InvalidCredentialsError } from 'ldapts';
import { Types } from 'mongoose';
import pino from 'pino';

import { HttpError } from '../../middleware/errors.js';
import { LdapSettings, type LdapSettingsDocument } from './ldap-settings.model.js';
import { openSecret, sealSecret } from './secret-box.js';

const logger = pino({ name: 'ldap' });
const TIMEOUT_MS = 8_000;

/** What Gnomon knows about a person after a successful directory sign-in. */
export interface LdapProfile {
  dn: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  department: string | null;
  designation: string | null;
  employeeId: string | null;
}

export type LdapLoginResult =
  | { status: 'ok'; profile: LdapProfile }
  | { status: 'invalid_password'; dn: string }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: string };

async function loadSettings(withPassword = false) {
  const query = LdapSettings.findOne({ key: 'ldap' });
  if (withPassword) query.select('+bindPasswordSealed');
  return query.lean<LdapSettingsDocument>().exec();
}

function toDto(settings: LdapSettingsDocument | null): LdapSettingsDto {
  if (!settings) {
    return {
      configured: false,
      enabled: false,
      url: 'ldap://',
      startTls: false,
      allowSelfSignedCertificate: false,
      bindDn: '',
      hasBindPassword: false,
      passwordNeedsReentry: false,
      baseDn: '',
      userFilter: defaultLdapUserFilter,
      attributes: defaultLdapAttributes,
      autoCreateUsers: true,
      notifyAdmins: true,
      lastTest: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    enabled: settings.enabled,
    url: settings.url,
    startTls: settings.startTls,
    allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
    bindDn: settings.bindDn,
    hasBindPassword: Boolean(settings.bindPasswordSealed),
    passwordNeedsReentry: Boolean(
      settings.bindPasswordSealed && openSecret(settings.bindPasswordSealed) === null,
    ),
    baseDn: settings.baseDn,
    userFilter: settings.userFilter,
    attributes: { ...defaultLdapAttributes, ...settings.attributes },
    autoCreateUsers: settings.autoCreateUsers,
    notifyAdmins: settings.notifyAdmins,
    lastTest: settings.lastTest
      ? { ...settings.lastTest, at: settings.lastTest.at.toISOString() }
      : null,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}

export async function getLdapSettings(): Promise<LdapSettingsDto> {
  return toDto(await loadSettings(true));
}

export async function updateLdapSettings(
  userId: string,
  input: UpdateLdapSettingsRequest,
): Promise<LdapSettingsDto> {
  const parsed = UpdateLdapSettingsRequestSchema.parse(input);
  const existing = await loadSettings(true);
  const bindPasswordSealed =
    parsed.bindPassword === undefined
      ? (existing?.bindPasswordSealed ?? null)
      : parsed.bindPassword === ''
        ? null
        : sealSecret(parsed.bindPassword);
  const { bindPassword: _omit, ...fields } = parsed;
  await LdapSettings.findOneAndUpdate(
    { key: 'ldap' },
    {
      $set: {
        ...fields,
        url: fields.url.replace(/\/$/, ''),
        bindPasswordSealed,
        updatedByUserId: new Types.ObjectId(userId),
      },
    },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  return getLdapSettings();
}

function clientFor(settings: LdapSettingsDocument): Client {
  return new Client({
    url: settings.url,
    timeout: TIMEOUT_MS,
    connectTimeout: TIMEOUT_MS,
    tlsOptions: { rejectUnauthorized: !settings.allowSelfSignedCertificate },
  });
}

async function openServiceSession(settings: LdapSettingsDocument): Promise<Client> {
  const client = clientFor(settings);
  if (settings.startTls) {
    await client.startTLS({ rejectUnauthorized: !settings.allowSelfSignedCertificate });
  }
  if (settings.bindDn) {
    const password = settings.bindPasswordSealed ? openSecret(settings.bindPasswordSealed) : '';
    if (password === null) {
      throw new Error('The saved bind password can no longer be read; enter it again');
    }
    await client.bind(settings.bindDn, password);
  }
  return client;
}

function firstValue(value: unknown): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  if (item === undefined || item === null) return null;
  const text = Buffer.isBuffer(item) ? item.toString('utf8') : String(item);
  return text.trim() || null;
}

async function findDirectoryUser(
  client: Client,
  settings: LdapSettingsDocument,
  login: string,
): Promise<LdapProfile | null> {
  const attributes = { ...defaultLdapAttributes, ...settings.attributes };
  const filter = settings.userFilter.replaceAll('{{login}}', Filter.escape(login));
  const { searchEntries } = await client.search(settings.baseDn, {
    scope: 'sub',
    filter,
    sizeLimit: 2,
    attributes: Object.values(attributes).filter(Boolean),
  });
  // Ambiguous matches never sign in.
  if (searchEntries.length !== 1) return null;
  const entry = searchEntries[0]!;
  const read = (name: string) => (name ? firstValue(entry[name]) : null);
  const username = read(attributes.username) ?? login.split('@')[0]!;
  const displayName = read(attributes.displayName);
  const [fallbackFirst, ...fallbackRest] = (displayName ?? username).split(/\s+/);
  return {
    dn: entry.dn,
    username: username.toLowerCase(),
    email: read(attributes.email)?.toLowerCase() ?? null,
    firstName: read(attributes.firstName) ?? fallbackFirst ?? username,
    lastName: read(attributes.lastName) ?? (fallbackRest.join(' ') || '-'),
    displayName,
    department: read(attributes.department),
    designation: read(attributes.designation),
    employeeId: read(attributes.employeeId),
  };
}

function describeLdapError(error: unknown): string {
  if (error instanceof InvalidCredentialsError) return 'Invalid credentials';
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED/.test(message)) return 'Connection refused by the directory server';
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'Directory server host not found';
  if (/timeout|ETIMEDOUT/i.test(message)) return 'Directory server did not respond in time';
  if (/certificate|self.signed|CERT_/i.test(message)) {
    return 'TLS certificate was not trusted (allow self-signed certificates if that is expected)';
  }
  return message.slice(0, 300);
}

/** The directory settings, only when directory sign-in is switched on. */
export async function activeLdapSettings(): Promise<LdapSettingsDocument | null> {
  const settings = await loadSettings(true);
  return settings?.enabled ? settings : null;
}

/**
 * Looks the login up in the directory and verifies the password by binding as
 * that person. Never throws: an outage reports `unavailable` so local accounts
 * (such as the built-in administrator) can still sign in.
 */
export async function authenticateWithLdap(
  settings: LdapSettingsDocument,
  login: string,
  password: string,
): Promise<LdapLoginResult> {
  if (!password) return { status: 'not_found' };
  let service: Client | null = null;
  try {
    service = await openServiceSession(settings);
    const profile = await findDirectoryUser(service, settings, login);
    if (!profile) return { status: 'not_found' };
    const userClient = clientFor(settings);
    try {
      if (settings.startTls) {
        await userClient.startTLS({ rejectUnauthorized: !settings.allowSelfSignedCertificate });
      }
      await userClient.bind(profile.dn, password);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return { status: 'invalid_password', dn: profile.dn };
      }
      throw error;
    } finally {
      await userClient.unbind().catch(() => undefined);
    }
    return { status: 'ok', profile };
  } catch (error) {
    const reason = describeLdapError(error);
    logger.warn({ reason }, 'Directory sign-in unavailable');
    return { status: 'unavailable', reason };
  } finally {
    await service?.unbind().catch(() => undefined);
  }
}

/** Tests the saved settings (even when disabled) and records the outcome. */
export async function testLdapSettings(input: TestLdapRequest): Promise<LdapSettingsDto> {
  const settings = await loadSettings(true);
  if (!settings) {
    throw new HttpError(400, 'Save the directory settings before testing', 'LDAP_NOT_CONFIGURED');
  }
  let result: { ok: boolean; message: string };
  if (input.login && input.password) {
    const outcome = await authenticateWithLdap(settings, input.login, input.password);
    result =
      outcome.status === 'ok'
        ? {
            ok: true,
            message: `Signed in as ${outcome.profile.displayName ?? outcome.profile.username}${
              outcome.profile.email ? ` <${outcome.profile.email}>` : ''
            }${outcome.profile.department ? `, ${outcome.profile.department}` : ''}`,
          }
        : outcome.status === 'invalid_password'
          ? { ok: false, message: `Found ${outcome.dn}, but the password was rejected` }
          : outcome.status === 'not_found'
            ? { ok: false, message: `No single directory account matches "${input.login}"` }
            : { ok: false, message: outcome.reason };
  } else {
    let client: Client | null = null;
    try {
      client = await openServiceSession(settings);
      if (input.login) {
        const profile = await findDirectoryUser(client, settings, input.login);
        result = profile
          ? {
              ok: true,
              message: `Connected. Found ${profile.dn}${profile.email ? ` <${profile.email}>` : ''}`,
            }
          : { ok: false, message: `Connected, but no single account matches "${input.login}"` };
      } else {
        result = { ok: true, message: `Connected and searched ${settings.baseDn}` };
        await client.search(settings.baseDn, { scope: 'base', sizeLimit: 1 });
      }
    } catch (error) {
      result = { ok: false, message: describeLdapError(error) };
    } finally {
      await client?.unbind().catch(() => undefined);
    }
  }
  await LdapSettings.updateOne(
    { key: 'ldap' },
    { $set: { lastTest: { at: new Date(), ...result } } },
  ).exec();
  return getLdapSettings();
}
