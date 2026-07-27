import { describe, expect, it } from 'vitest';

import { defaultWorkdayPolicy, getWorkDate, WorkdayPolicySchema } from './time.js';

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
