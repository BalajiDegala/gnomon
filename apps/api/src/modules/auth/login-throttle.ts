import { model, Schema } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';

/**
 * Brute-force protection for sign-in, shared by every API replica through
 * MongoDB (documents expire on their own; no Redis needed).
 *
 * - per login ID: 5 failures within 15 minutes lock that ID for 15 minutes;
 * - per client IP: 100 failures within 15 minutes lock the IP for 15 minutes
 *   (generous because a whole office can share one NAT address).
 */
export const LOGIN_LIMITS = {
  user: { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  ip: { maxFailures: 100, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
} as const;

interface LoginAttemptDocument {
  _id: string;
  failures: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  expiresAt: Date;
}

const loginAttemptSchema = new Schema<LoginAttemptDocument>(
  {
    _id: { type: String, required: true },
    failures: { type: Number, required: true },
    windowStartedAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'login_attempts', versionKey: false },
);
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttempt = model<LoginAttemptDocument>('LoginAttempt', loginAttemptSchema);

function userKey(loginId: string): string {
  return `user:${loginId.trim().toLowerCase().slice(0, 200)}`;
}

function ipKey(ip: string | null): string | null {
  return ip ? `ip:${ip.slice(0, 100)}` : null;
}

function minutesUntil(date: Date, now: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 60_000));
}

export async function assertLoginAllowed(
  loginId: string,
  ip: string | null,
  now = new Date(),
): Promise<void> {
  const keys = [userKey(loginId), ipKey(ip)].filter((key): key is string => Boolean(key));
  const locked = await LoginAttempt.find({ _id: { $in: keys }, lockedUntil: { $gt: now } })
    .lean()
    .exec();
  const until = locked
    .map((attempt) => attempt.lockedUntil!)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  if (until) {
    throw new HttpError(
      429,
      `Too many failed sign-in attempts. Try again in ${minutesUntil(until, now)} minute(s).`,
      'LOGIN_LOCKED',
    );
  }
}

async function registerFailure(
  key: string,
  limits: { maxFailures: number; windowMs: number; lockMs: number },
  now: Date,
): Promise<void> {
  const windowStart = new Date(now.getTime() - limits.windowMs);
  // One atomic pipeline update: restart the window when it has passed, then count
  // and lock once the limit is reached.
  await LoginAttempt.updateOne(
    { _id: key },
    [
      {
        $set: {
          failures: {
            $cond: [
              { $gt: [{ $ifNull: ['$windowStartedAt', new Date(0)] }, windowStart] },
              { $add: ['$failures', 1] },
              1,
            ],
          },
          windowStartedAt: {
            $cond: [
              { $gt: [{ $ifNull: ['$windowStartedAt', new Date(0)] }, windowStart] },
              '$windowStartedAt',
              now,
            ],
          },
        },
      },
      {
        $set: {
          lockedUntil: {
            $cond: [
              { $gte: ['$failures', limits.maxFailures] },
              new Date(now.getTime() + limits.lockMs),
              { $ifNull: ['$lockedUntil', null] },
            ],
          },
          expiresAt: new Date(now.getTime() + limits.windowMs + limits.lockMs),
        },
      },
    ],
    // Mongoose requires an explicit opt-in for aggregation-pipeline updates.
    { upsert: true, updatePipeline: true },
  ).exec();
}

export async function recordLoginFailure(
  loginId: string,
  ip: string | null,
  now = new Date(),
): Promise<void> {
  const ipAttemptKey = ipKey(ip);
  await Promise.all([
    registerFailure(userKey(loginId), LOGIN_LIMITS.user, now),
    ipAttemptKey ? registerFailure(ipAttemptKey, LOGIN_LIMITS.ip, now) : Promise.resolve(),
  ]);
}

export async function recordLoginSuccess(loginId: string): Promise<void> {
  await LoginAttempt.deleteOne({ _id: userKey(loginId) }).exec();
}
