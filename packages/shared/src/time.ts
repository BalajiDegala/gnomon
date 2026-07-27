import { z } from 'zod';

export const WorkdayPolicySchema = z.object({
  timezone: z.string().default('Asia/Kolkata'),
  windowStartMinutes: z.number().int().min(0).max(1439).default(420),
  expectedStartMinutes: z.number().int().min(0).max(1439).default(540),
  expectedEndMinutes: z.number().int().min(0).max(1439).default(1080),
  requiredMinutes: z.number().int().positive().default(540),
  workingWeekdays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
});

export type WorkdayPolicy = z.infer<typeof WorkdayPolicySchema>;

export const defaultWorkdayPolicy: WorkdayPolicy = WorkdayPolicySchema.parse({});

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface WorkdayWindow {
  start: Date;
  end: Date;
  expectedStart: Date;
  expectedEnd: Date;
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const read = (name: keyof ZonedDateParts): number => {
    const value = values.get(name);
    if (!value) throw new Error(`Could not resolve ${name} in timezone ${timezone}`);
    return Number(value);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function zonedLocalDateTimeToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timezone: string,
): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredAsUtc;

  // Converge on the UTC instant whose formatted local parts match the requested
  // wall-clock time. Repeating also handles timezone offset transitions.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedDateParts(new Date(candidate), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    candidate += desiredAsUtc - actualAsUtc;
  }

  return new Date(candidate);
}

/** Resolve the configured local schedule boundaries for an ISO work date. */
export function getWorkdayWindow(
  workDate: string,
  policy: WorkdayPolicy = defaultWorkdayPolicy,
): WorkdayWindow {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate);
  if (!match) throw new Error('A valid ISO work date is required');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error('A valid ISO work date is required');
  }

  const nextDate = new Date(calendarDate.getTime() + 24 * 60 * 60_000);
  return {
    start: zonedLocalDateTimeToInstant(
      year,
      month,
      day,
      policy.windowStartMinutes,
      policy.timezone,
    ),
    end: zonedLocalDateTimeToInstant(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      policy.windowStartMinutes,
      policy.timezone,
    ),
    expectedStart: zonedLocalDateTimeToInstant(
      year,
      month,
      day,
      policy.expectedStartMinutes,
      policy.timezone,
    ),
    expectedEnd: zonedLocalDateTimeToInstant(
      year,
      month,
      day,
      policy.expectedEndMinutes,
      policy.timezone,
    ),
  };
}

/** Assign an instant to the company's logical work date. */
export function getWorkDate(instant: Date, policy: WorkdayPolicy = defaultWorkdayPolicy): string {
  if (Number.isNaN(instant.getTime())) throw new Error('A valid instant is required');

  const local = getZonedDateParts(instant, policy.timezone);
  const localMinutes = local.hour * 60 + local.minute;

  if (localMinutes >= policy.windowStartMinutes) {
    return formatIsoDate(local.year, local.month, local.day);
  }

  const previousDate = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
  return formatIsoDate(
    previousDate.getUTCFullYear(),
    previousDate.getUTCMonth() + 1,
    previousDate.getUTCDate(),
  );
}
