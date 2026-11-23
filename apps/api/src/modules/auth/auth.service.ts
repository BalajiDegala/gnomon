import type { AuthUser, PermissionCode } from '@gnomon/shared';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';

import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { Role, RoleAssignment } from '../roles/role.model.js';
import { activeLdapSettings, authenticateWithLdap } from '../settings/ldap.service.js';
import { resolveLdapAccount } from './ldap-accounts.service.js';
import { User, type UserRecord } from './user.model.js';

const encoder = new TextEncoder();
const accessTokenKey = encoder.encode(env.ACCESS_TOKEN_SECRET);
const refreshTokenKey = encoder.encode(env.REFRESH_TOKEN_SECRET);

interface TokenIdentity {
  userId: string;
  tokenVersion: number;
}

export async function issueAccessToken(identity: TokenIdentity): Promise<string> {
  return new SignJWT({ typ: 'access', ver: identity.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessTokenKey);
}

export async function issueRefreshToken(identity: TokenIdentity): Promise<string> {
  return new SignJWT({ typ: 'refresh', ver: identity.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.userId)
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_TTL)
    .sign(refreshTokenKey);
}

async function verifyToken(
  token: string,
  expectedType: 'access' | 'refresh',
): Promise<TokenIdentity> {
  try {
    const key = expectedType === 'access' ? accessTokenKey : refreshTokenKey;
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });

    if (!payload.sub || payload.typ !== expectedType || typeof payload.ver !== 'number') {
      throw new Error('Unexpected token claims');
    }

    return { userId: payload.sub, tokenVersion: payload.ver };
  } catch {
    throw new HttpError(401, 'The session is invalid or expired', 'INVALID_SESSION');
  }
}

export function verifyAccessToken(token: string): Promise<TokenIdentity> {
  return verifyToken(token, 'access');
}

export function verifyRefreshToken(token: string): Promise<TokenIdentity> {
  return verifyToken(token, 'refresh');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves a login User ID to an account. The directory User ID (users.csv)
 * wins; accounts without one, such as the seeded administrator, sign in with
 * the part of their email before the @. Ambiguous matches never sign in.
 */
async function findUserByLoginId(userId: string): Promise<UserRecord | null> {
  const employees = await Employee.find({ 'hrProfile.userId': userId, status: 'active' })
    .select({ _id: 1 })
    .limit(2)
    .lean()
    .exec();
  if (employees.length === 1) {
    return User.findOne({ employeeId: employees[0]!._id, status: 'active' })
      .select('+passwordHash')
      .exec();
  }
  if (employees.length > 1) return null;

  const users = await User.find({
    email: new RegExp(`^${escapeRegExp(userId)}@`),
    status: 'active',
  })
    .select('+passwordHash')
    .limit(2)
    .exec();
  return users.length === 1 ? users[0]! : null;
}

/**
 * Signs a person in. With directory (AD/LDAP) sign-in on, the directory is
 * asked first: a match signs in with the directory password and is linked to
 * (or creates) the Gnomon account. People the directory does not know, such as
 * the built-in administrator, keep signing in with their local password.
 */
export async function authenticateUser(userId: string, password: string): Promise<UserRecord> {
  const ldap = await activeLdapSettings();
  let directoryUnavailable = false;
  if (ldap) {
    const outcome = await authenticateWithLdap(ldap, userId, password);
    if (outcome.status === 'ok') {
      const account = await resolveLdapAccount(outcome.profile, ldap);
      account.lastLoginAt = new Date();
      await account.save();
      return account;
    }
    if (outcome.status === 'invalid_password') {
      throw new HttpError(401, 'Invalid user ID or password', 'INVALID_CREDENTIALS');
    }
    directoryUnavailable = outcome.status === 'unavailable';
  }

  const user = await findUserByLoginId(userId);
  if (user?.authSource === 'ldap') {
    // Directory accounts only accept the directory password.
    throw directoryUnavailable
      ? new HttpError(
          503,
          'The company directory is not reachable right now. Please try again shortly.',
          'LDAP_UNAVAILABLE',
        )
      : new HttpError(401, 'Invalid user ID or password', 'INVALID_CREDENTIALS');
  }
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid user ID or password', 'INVALID_CREDENTIALS');
  }

  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function getActiveUser(userId: string, tokenVersion: number): Promise<UserRecord> {
  const user = await User.findOne({
    _id: userId,
    status: 'active',
    tokenVersion,
  }).exec();

  if (!user) {
    throw new HttpError(401, 'The session is no longer active', 'INVALID_SESSION');
  }

  return user;
}

export async function buildAuthUser(user: UserRecord): Promise<AuthUser> {
  const employee = await Employee.findOne({ _id: user.employeeId, status: 'active' }).lean().exec();
  if (!employee) {
    throw new HttpError(403, 'No active employee profile is linked to this account', 'NO_EMPLOYEE');
  }

  const now = new Date();
  const assignments = await RoleAssignment.find({
    userId: user._id,
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
  })
    .lean()
    .exec();

  const roleIds = assignments.map((assignment) => assignment.roleId);
  const roles = await Role.find({ _id: { $in: roleIds } })
    .lean()
    .exec();
  const roleById = new Map(roles.map((role) => [String(role._id), role]));
  const permissions = new Set<PermissionCode>();

  for (const assignment of assignments) {
    const role = roleById.get(String(assignment.roleId));
    for (const permission of role?.permissions ?? []) {
      permissions.add(permission);
    }
  }

  return {
    id: String(user._id),
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    displayName: `${employee.firstName} ${employee.lastName}`.trim(),
    email: user.email,
    permissions: [...permissions],
    scopes: assignments.map((assignment) => ({
      type: assignment.scopeType,
      ids: assignment.scopeIds.map(String),
    })),
    grants: assignments.flatMap((assignment) => {
      const role = roleById.get(String(assignment.roleId));
      if (!role) return [];
      return [
        {
          roleCode: role.code,
          permissions: role.permissions,
          scope: {
            type: assignment.scopeType,
            ids: assignment.scopeIds.map(String),
          },
        },
      ];
    }),
  };
}
