import { useEffect, useState } from 'react';

export const INDIA_ZONE = 'Asia/Kolkata';
export const CALIFORNIA_ZONE = 'America/Los_Angeles';

export interface ZoneTime {
  /** "HHMMSS", 24-hour. */
  digits: string;
  hour: number;
  minute: number;
  /** Short zone name, e.g. IST, PST or PDT. */
  abbreviation: string;
  weekday: string;
  /** Offset from UTC in minutes. */
  offsetMinutes: number;
}

function parts(zone: string, date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
}

const abbreviations: Record<string, Record<number, string>> = {
  [INDIA_ZONE]: { 330: 'IST' },
  [CALIFORNIA_ZONE]: { [-480]: 'PST', [-420]: 'PDT' },
};

export function zoneTime(zone: string, date: Date): ZoneTime {
  const p = parts(zone, date);
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  const offsetMinutes = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '−';
  const absolute = Math.abs(offsetMinutes);
  return {
    digits: `${p.hour}${p.minute}${p.second}`,
    hour: +p.hour!,
    minute: +p.minute!,
    abbreviation:
      abbreviations[zone]?.[offsetMinutes] ??
      `UTC${sign}${Math.floor(absolute / 60)}${absolute % 60 ? `:${absolute % 60}` : ''}`,
    weekday: p.weekday!,
    offsetMinutes,
  };
}

/** "13 h 30 m" style gap between two offsets. */
export function formatGap(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `${Math.floor(absolute / 60)} h ${String(absolute % 60).padStart(2, '0')} m`;
}

/** Work date in India: the workday runs 07:00 to 07:00, so 02:00 belongs to the previous day. */
export function indiaWorkDate(date: Date): string {
  const shifted = new Date(date.getTime() - 7 * 3_600_000);
  const p = parts(INDIA_ZONE, shifted);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isoWeekNumber(workDate: string): number {
  const date = new Date(`${workDate}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** Re-renders every `intervalMs` with the current time. */
export function useNow(intervalMs = 1_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
