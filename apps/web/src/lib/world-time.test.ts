import { describe, expect, it } from 'vitest';

import {
  CALIFORNIA_ZONE,
  formatGap,
  INDIA_ZONE,
  indiaWorkDate,
  isoWeekNumber,
  zoneTime,
} from './world-time';

describe('world time', () => {
  it('reads India and California time with the right abbreviations', () => {
    const winter = new Date('2026-11-19T09:30:15.000Z');
    expect(zoneTime(INDIA_ZONE, winter)).toMatchObject({
      digits: '150015',
      abbreviation: 'IST',
      offsetMinutes: 330,
    });
    expect(zoneTime(CALIFORNIA_ZONE, winter)).toMatchObject({
      digits: '013015',
      abbreviation: 'PST',
      offsetMinutes: -480,
    });
    const summer = new Date('2026-07-01T12:00:00.000Z');
    expect(zoneTime(CALIFORNIA_ZONE, summer).abbreviation).toBe('PDT');
  });

  it('formats the gap between zones', () => {
    expect(formatGap(330 - -480)).toBe('13 h 30 m');
    expect(formatGap(330 - -420)).toBe('12 h 30 m');
  });

  it('keeps late-night time on the previous work date', () => {
    expect(indiaWorkDate(new Date('2026-11-19T20:30:00.000Z'))).toBe('2026-11-19'); // 02:00 IST on the 20th
    expect(indiaWorkDate(new Date('2026-11-20T01:31:00.000Z'))).toBe('2026-11-20'); // 07:01 IST
  });

  it('computes ISO week numbers', () => {
    expect(isoWeekNumber('2026-11-19')).toBe(47);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
  });
});
