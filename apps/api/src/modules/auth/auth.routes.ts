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
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from './login-throttle.js';
import { describeEvent, setEventActor } from '../system-events/request-context.js';

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
  describeEvent({ subject: { type: 'login', id: null, employeeCode: null, label: input.userId } });
  const ip = request.ip ?? null;
  await assertLoginAllowed(input.userId, ip);
  let user: Awaited<ReturnType<typeof authenticateUser>>;
  try {
    user = await authenticateUser(input.userId, input.password);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'INVALID_CREDENTIALS') {
      // Counting must never turn a wrong password into a server error.
      await recordLoginFailure(input.userId, ip).catch((countError: unknown) => {
        request.log.warn({ error: countError }, 'Could not record failed sign-in');
      });
    }
    throw error;
  }
  await recordLoginSuccess(input.userId);
  const identity = { userId: String(user._id), tokenVersion: user.tokenVersion };
  const [accessToken, refreshToken, authUser] = await Promise.all([
    issueAccessToken(identity),
    issueRefreshToken(identity),
    buildAuthUser(user),
  ]);

  setEventActor(authUser);
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
      setEventActor({ type: 'user', id: String(user._id), employeeCode: null, label: user.email });
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
