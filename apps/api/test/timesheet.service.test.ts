import { describe, expect, it } from 'vitest';

import { validateTimeEntryWindow } from '../src/modules/timesheets/timesheet.service.js';

describe('show time-entry windows', () => {
  it('calculates duration and work date for a normal interval', () => {
    const window = validateTimeEntryWindow(
      '2026-07-27T09:00:00+05:30',
      '2026-07-27T11:15:00+05:30',
      new Date('2026-07-27T12:00:00+05:30'),
    );

    expect(window.workDate).toBe('2026-07-27');
    expect(window.durationMinutes).toBe(135);
  });

  it('keeps cross-midnight work inside the originating work date', () => {
    const window = validateTimeEntryWindow(
      '2026-07-27T20:00:00+05:30',
      '2026-07-28T05:00:00+05:30',
      new Date('2026-07-28T06:00:00+05:30'),
    );

    expect(window.workDate).toBe('2026-07-27');
    expect(window.durationMinutes).toBe(540);
  });

  it('rejects an interval that crosses the 07:00 workday boundary', () => {
    expect(() =>
      validateTimeEntryWindow(
        '2026-07-28T06:30:00+05:30',
        '2026-07-28T07:30:00+05:30',
        new Date('2026-07-28T08:00:00+05:30'),
      ),
    ).toThrow('07:00-to-07:00');
  });

  it('rejects future and over-24-hour entries', () => {
    expect(() =>
      validateTimeEntryWindow(
        '2026-07-27T10:00:00+05:30',
        '2026-07-27T11:00:00+05:30',
        new Date('2026-07-27T09:00:00+05:30'),
      ),
    ).toThrow('future');

    expect(() =>
      validateTimeEntryWindow(
        '2026-07-26T07:00:00+05:30',
        '2026-07-27T07:01:00+05:30',
        new Date('2026-07-28T09:00:00+05:30'),
      ),
    ).toThrow('24 hours');
  });
});
