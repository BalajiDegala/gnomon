import { LoginRequestSchema } from '@gnomon/shared';
import { Router, type Response } from 'express';

import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/errors.js';
import {
  authenticateUser,
  buildAuthUser,
  getActiveUser,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from './auth.service.js';

export const refreshCookieName = 'gnomon_refresh';

function setRefreshCookie(response: Response, token: string): void {
  response.cookie(refreshCookieName, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
}

export const authRouter = Router();

authRouter.post('/login', async (request, response) => {
  const input = LoginRequestSchema.parse(request.body);
  const user = await authenticateUser(input.email, input.password);
  const identity = { userId: String(user._id), tokenVersion: user.tokenVersion };
  const [accessToken, refreshToken, authUser] = await Promise.all([
    issueAccessToken(identity),
    issueRefreshToken(identity),
    buildAuthUser(user),
  ]);

  setRefreshCookie(response, refreshToken);
  response.json({ accessToken, user: authUser });
});

authRouter.post('/refresh', async (request, response) => {
  const refreshToken = request.cookies[refreshCookieName] as string | undefined;
  if (!refreshToken) {
    throw new HttpError(401, 'A refresh session is required', 'REFRESH_REQUIRED');
  }

  const identity = await verifyRefreshToken(refreshToken);
  const user = await getActiveUser(identity.userId, identity.tokenVersion);
  const [accessToken, authUser] = await Promise.all([
    issueAccessToken(identity),
    buildAuthUser(user),
  ]);

  response.json({ accessToken, user: authUser });
});

authRouter.post('/logout', async (request, response) => {
  const refreshToken = request.cookies[refreshCookieName] as string | undefined;

  if (refreshToken) {
    try {
      const identity = await verifyRefreshToken(refreshToken);
      const user = await getActiveUser(identity.userId, identity.tokenVersion);
      user.tokenVersion += 1;
      await user.save();
    } catch {
      // Logout remains idempotent when the session has already expired.
    }
  }

  clearRefreshCookie(response);
  response.status(204).send();
});

authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.authUser });
});
