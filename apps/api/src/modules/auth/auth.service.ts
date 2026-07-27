import type { AuthUser, PermissionCode } from '@gnomon/shared';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';

import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { Role, RoleAssignment } from '../roles/role.model.js';
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

export async function authenticateUser(email: string, password: string): Promise<UserRecord> {
  const user = await User.findOne({ email, status: 'active' }).select('+passwordHash').exec();

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
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
