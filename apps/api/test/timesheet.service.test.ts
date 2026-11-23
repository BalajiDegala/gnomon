import { describe, expect, it } from 'vitest';

import { validateTimeEntryHours } from '../src/modules/timesheets/timesheet.service.js';

describe('show time-entry hours', () => {
  const now = new Date('2026-07-27T12:00:00+05:30');

  it('converts hours to minutes for the given work date', () => {
    expect(validateTimeEntryHours('2026-07-27', 2.25, now)).toEqual({
      workDate: '2026-07-27',
      durationMinutes: 135,
    });
  });

  it('allows past work dates', () => {
    expect(validateTimeEntryHours('2026-07-20', 8, now).durationMinutes).toBe(480);
  });

  it('rejects future work dates', () => {
    expect(() => validateTimeEntryHours('2026-07-28', 1, now)).toThrow('future');
  });

  it('rejects zero and over-24-hour entries', () => {
    expect(() => validateTimeEntryHours('2026-07-27', 0, now)).toThrow('more than 0');
    expect(() => validateTimeEntryHours('2026-07-27', 24.5, now)).toThrow('24 hours');
  });
});
