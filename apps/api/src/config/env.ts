import 'dotenv/config';

import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/gnomon'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  REFRESH_COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(604_800_000),
  COOKIE_SECURE: booleanString,
  /**
   * Key for secrets stored in the database (the SMTP password). Optional: when
   * unset, a key is derived from ACCESS_TOKEN_SECRET, so rotating that secret
   * means re-entering the SMTP password in Site preferences.
   */
  SETTINGS_ENCRYPTION_KEY: z.string().min(32).optional(),
  /** Record system events (debug log). Defaults to on, except under tests. */
  SYSTEM_EVENTS_ENABLED: z.enum(['true', 'false']).optional(),
  /**
   * Reverse proxies in front of the API, used to find the browser's IP address
   * (timecard machine, availability page). Compose: web nginx = 1. Kubernetes:
   * ingress + web nginx = 2.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  SYSTEM_EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
});

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  ...result.data,
  SYSTEM_EVENTS_ENABLED:
    result.data.SYSTEM_EVENTS_ENABLED === undefined
      ? result.data.NODE_ENV !== 'test'
      : result.data.SYSTEM_EVENTS_ENABLED === 'true',
};
