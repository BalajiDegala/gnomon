import type { PermissionCode, ScopeType } from '@gnomon/shared';
import type { RequestHandler } from 'express';

import { HttpError } from './errors.js';
import { buildAuthUser, getActiveUser, verifyAccessToken } from '../modules/auth/auth.service.js';

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authentication is required', 'AUTHENTICATION_REQUIRED');
    }

    const identity = await verifyAccessToken(authorization.slice('Bearer '.length));
    const user = await getActiveUser(identity.userId, identity.tokenVersion);
    request.authUser = await buildAuthUser(user);
    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(
  permission: PermissionCode,
  allowedScopes?: ScopeType[],
): RequestHandler {
  return (request, _response, next) => {
    if (!request.authUser) {
      next(new HttpError(401, 'Authentication is required', 'AUTHENTICATION_REQUIRED'));
      return;
    }

    if (!request.authUser.permissions.includes(permission)) {
      next(new HttpError(403, 'You do not have permission for this action', 'FORBIDDEN'));
      return;
    }

    if (
      allowedScopes &&
      !request.authUser.grants.some(
        (grant) =>
          grant.permissions.includes(permission) && allowedScopes.includes(grant.scope.type),
      )
    ) {
      next(new HttpError(403, 'This action is outside your assigned scope', 'SCOPE_FORBIDDEN'));
      return;
    }

    next();
  };
}
