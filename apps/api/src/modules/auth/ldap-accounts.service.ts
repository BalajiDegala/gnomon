import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import pino from 'pino';

import { HttpError } from '../../middleware/errors.js';
import { Employee, type EmployeeDocument } from '../employees/employee.model.js';
import { Notification } from '../notifications/notification.model.js';
import { Role, RoleAssignment } from '../roles/role.model.js';
import { SecurityAuditEvent } from '../roles/security-audit.model.js';
import { ensureSystemRoles } from '../roles/system-roles.js';
import type { LdapSettingsDocument } from '../settings/ldap-settings.model.js';
import type { LdapProfile } from '../settings/ldap.service.js';
import { sendMail } from '../settings/smtp.service.js';
import { User, type UserRecord } from './user.model.js';

const logger = pino({ name: 'ldap-accounts' });

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Directory accounts never use a local password; this one cannot be guessed or used. */
async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString('base64'), 10);
}

/**
 * Finds the one existing Gnomon person this directory account belongs to, so a
 * sign-in never creates a duplicate. Matches by email (account, profile or HR
 * mail ID), directory user ID (HR user ID or the part of the account email
 * before the @) or employee ID. More than one distinct match is refused.
 */
async function findExistingPerson(profile: LdapProfile): Promise<{
  user: UserRecord | null;
  employeeId: Types.ObjectId | null;
}> {
  const linked = await User.findOne({ ldapDn: profile.dn }).exec();
  if (linked) return { user: linked, employeeId: linked.employeeId };

  const userConditions: object[] = [
    { email: new RegExp(`^${escapeRegExp(profile.username)}@`, 'i') },
  ];
  const employeeConditions: object[] = [{ 'hrProfile.userId': profile.username }];
  if (profile.email) {
    userConditions.push({ email: profile.email });
    employeeConditions.push({ email: profile.email }, { 'hrProfile.mailId': profile.email });
  }
  if (profile.employeeId) {
    employeeConditions.push({ employeeCode: profile.employeeId.toUpperCase() });
  }
  const [users, employees] = await Promise.all([
    User.find({ $or: userConditions }).limit(3).exec(),
    Employee.find({ $or: employeeConditions }).select({ _id: 1 }).limit(3).lean().exec(),
  ]);
  const employeeIds = new Set([
    ...users.map((user) => String(user.employeeId)),
    ...employees.map((employee) => String(employee._id)),
  ]);
  if (employeeIds.size > 1) {
    throw new HttpError(
      409,
      'This directory account matches more than one Gnomon person. Ask an administrator to merge them.',
      'LDAP_AMBIGUOUS_ACCOUNT',
    );
  }
  if (employeeIds.size === 0) return { user: null, employeeId: null };
  const employeeId = new Types.ObjectId([...employeeIds][0]!);
  const user = users.find((candidate) => candidate.employeeId.equals(employeeId)) ?? null;
  return { user: user ?? (await User.findOne({ employeeId }).exec()), employeeId };
}

function sanitizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40);
}

async function uniqueEmployeeCode(profile: LdapProfile): Promise<string> {
  const base =
    (profile.employeeId && sanitizeCode(profile.employeeId)) ||
    `AD-${sanitizeCode(profile.username) || 'USER'}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await Employee.exists({ employeeCode: code }))) return code;
  }
  return `${base}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function grantEmployeeRole(userId: Types.ObjectId, employeeId: Types.ObjectId) {
  const roles = await ensureSystemRoles();
  const employeeRole = roles.get('EMPLOYEE');
  if (!employeeRole) throw new Error('Employee role is unavailable');
  await RoleAssignment.findOneAndUpdate(
    { userId, roleId: employeeRole._id, scopeType: 'self' },
    {
      $setOnInsert: {
        userId,
        roleId: employeeRole._id,
        scopeType: 'self',
        scopeIds: [employeeId],
        validFrom: new Date(),
        validUntil: null,
        grantedBy: null,
      },
    },
    { upsert: true },
  ).exec();
}

/** Employees of users who administer Gnomon (system admins and Site preferences managers). */
async function administratorRecipients(): Promise<
  Array<{ employeeId: Types.ObjectId; email: string }>
> {
  const roles = await Role.find({
    $or: [{ code: 'SYSTEM_ADMIN' }, { permissions: 'policy:manage' }],
  })
    .select({ _id: 1 })
    .lean()
    .exec();
  const now = new Date();
  const assignments = await RoleAssignment.find({
    roleId: { $in: roles.map((role) => role._id) },
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
  })
    .select({ userId: 1 })
    .lean()
    .exec();
  const users = await User.find({
    _id: { $in: assignments.map((assignment) => assignment.userId) },
    status: 'active',
  })
    .select({ employeeId: 1, email: 1 })
    .lean()
    .exec();
  return users.map((user) => ({ employeeId: user.employeeId, email: user.email }));
}

async function notifyAdministrators(
  settings: LdapSettingsDocument,
  user: UserRecord,
  employee: Pick<EmployeeDocument, 'employeeCode' | 'firstName' | 'lastName'>,
  createdEmployee: boolean,
) {
  try {
    const recipients = await administratorRecipients();
    const name = `${employee.firstName} ${employee.lastName}`.trim();
    const title = createdEmployee
      ? 'New user from Active Directory'
      : 'Directory sign-in linked to an existing person';
    const message = createdEmployee
      ? `${name} (${employee.employeeCode}) signed in with Active Directory and was added with the Employee role.`
      : `${name} (${employee.employeeCode}) now signs in with Active Directory and has the Employee role.`;
    if (recipients.length) {
      await Notification.bulkWrite(
        recipients.map((recipient) => ({
          updateOne: {
            filter: { dedupeKey: `user:${String(user._id)}:ldap:${String(recipient.employeeId)}` },
            update: {
              $setOnInsert: {
                recipientEmployeeId: recipient.employeeId,
                kind: 'user_provisioned' as const,
                entityType: 'user' as const,
                entityId: user._id,
                dedupeKey: `user:${String(user._id)}:ldap:${String(recipient.employeeId)}`,
                title,
                message,
                href: `/people?q=${encodeURIComponent(employee.employeeCode)}&status=all`,
                readAt: null,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const emails = recipients
      .map((recipient) => recipient.email)
      .filter((email) => !email.endsWith('.invalid'));
    if (settings.notifyAdmins && emails.length) {
      await sendMail({
        to: emails,
        subject: `Gnomon: ${title}`,
        text: `${message}\n\nReview their department and roles in Gnomon under People and Administration.`,
      });
    }
  } catch (error) {
    // A notification problem must never block someone from signing in.
    logger.warn({ error }, 'Could not notify administrators about a directory account');
  }
}

/**
 * Turns a successful directory sign-in into a Gnomon account:
 * - an existing account is linked (its password now comes from the directory);
 * - an existing person without an account gets one;
 * - otherwise (when allowed) a new person and account are created.
 * New accounts receive the Employee role and administrators are notified.
 */
export async function resolveLdapAccount(
  profile: LdapProfile,
  settings: LdapSettingsDocument,
): Promise<UserRecord> {
  const existing = await findExistingPerson(profile);

  if (existing.user) {
    if (existing.user.status !== 'active') {
      throw new HttpError(403, 'This account is not active', 'ACCOUNT_INACTIVE');
    }
    if (existing.user.authSource !== 'ldap' || existing.user.ldapDn !== profile.dn) {
      existing.user.authSource = 'ldap';
      existing.user.ldapDn = profile.dn;
      await existing.user.save();
    }
    return existing.user;
  }

  let employeeId = existing.employeeId;
  let createdEmployee = false;
  if (employeeId) {
    const employee = await Employee.findById(employeeId).select({ status: 1 }).lean().exec();
    if (!employee || employee.status !== 'active') {
      throw new HttpError(403, 'This person is not active in Gnomon', 'ACCOUNT_INACTIVE');
    }
  } else {
    if (!settings.autoCreateUsers) {
      throw new HttpError(
        403,
        'Your directory account is not set up in Gnomon yet. Please contact an administrator.',
        'LDAP_ACCOUNT_NOT_PROVISIONED',
      );
    }
    const email = profile.email ?? `${profile.username}@gnomon.invalid`;
    const fullName = profile.displayName ?? `${profile.firstName} ${profile.lastName}`.trim();
    const created = await Employee.create({
      employeeCode: await uniqueEmployeeCode(profile),
      firstName: profile.firstName,
      lastName: profile.lastName,
      email,
      timezone: 'Asia/Kolkata',
      reportingManagerId: null,
      departmentId: null,
      locationId: null,
      attendanceIdentity: null,
      profileSource: 'ldap',
      hrProfile: profile.department
        ? {
            source: 'users_csv',
            userId: profile.username,
            mailId: email,
            fullName,
            designation: profile.designation ?? '',
            departmentName: profile.department,
            leaveApprover1Name: null,
            leaveApprover2Name: null,
            approver1EmployeeId: null,
            approver2EmployeeId: null,
            emailTriggers: [],
            importedAt: new Date(),
          }
        : null,
      status: 'active',
    });
    employeeId = created._id;
    createdEmployee = true;
  }

  const employee = await Employee.findById(employeeId).lean().exec();
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');
  // The login email must be unique; fall back to the directory email when the
  // profile email is already used by another account.
  const accountEmail = (await User.exists({ email: employee.email }))
    ? (profile.email ?? `${profile.username}@gnomon.invalid`)
    : employee.email;
  const user = await User.create({
    employeeId,
    email: accountEmail,
    passwordHash: await unusablePasswordHash(),
    status: 'active',
    tokenVersion: 0,
    authSource: 'ldap',
    ldapDn: profile.dn,
  });
  await grantEmployeeRole(user._id, employeeId);
  await SecurityAuditEvent.create({
    actorUserId: user._id,
    targetUserId: user._id,
    action: 'account_provisioned',
    details: { source: 'ldap', dn: profile.dn, createdEmployee },
  }).catch(() => undefined);
  await notifyAdministrators(settings, user, employee, createdEmployee);
  return User.findById(user._id).select('+passwordHash').orFail().exec();
}
