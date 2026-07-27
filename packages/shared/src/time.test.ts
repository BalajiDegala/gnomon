import { describe, expect, it } from 'vitest';

import {
  defaultWorkdayPolicy,
  getWorkDate,
  getWorkdayWindow,
  WorkdayPolicySchema,
} from './time.js';

describe('WorkdayPolicySchema', () => {
  it('uses the agreed DIGITAL DOMAIN INDIA defaults', () => {
    expect(defaultWorkdayPolicy).toEqual({
      timezone: 'Asia/Kolkata',
      windowStartMinutes: 420,
      expectedStartMinutes: 540,
      expectedEndMinutes: 1080,
      requiredMinutes: 540,
      workingWeekdays: [1, 2, 3, 4, 5],
    });
  });

  it('rejects an invalid attendance boundary', () => {
    expect(() => WorkdayPolicySchema.parse({ windowStartMinutes: 1440 })).toThrow();
  });
});

describe('getWorkDate', () => {
  it('assigns 06:59 in India to the previous work date', () => {
    expect(getWorkDate(new Date('2026-07-27T01:29:59.000Z'))).toBe('2026-07-26');
  });

  it('starts the new work date at exactly 07:00 in India', () => {
    expect(getWorkDate(new Date('2026-07-27T01:30:00.000Z'))).toBe('2026-07-27');
  });

  it('keeps an after-midnight session before 07:00 on the previous work date', () => {
    expect(getWorkDate(new Date('2026-07-27T23:30:00.000Z'))).toBe('2026-07-27');
  });
});

describe('getWorkdayWindow', () => {
  it('resolves the India schedule to exact UTC instants', () => {
    const window = getWorkdayWindow('2026-07-27');

    expect(window.start.toISOString()).toBe('2026-07-27T01:30:00.000Z');
    expect(window.end.toISOString()).toBe('2026-07-28T01:30:00.000Z');
    expect(window.expectedStart.toISOString()).toBe('2026-07-27T03:30:00.000Z');
    expect(window.expectedEnd.toISOString()).toBe('2026-07-27T12:30:00.000Z');
  });

  it('rejects impossible calendar dates', () => {
    expect(() => getWorkdayWindow('2026-02-30')).toThrow('valid ISO work date');
  });
});
