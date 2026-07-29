import { describe, expect, it } from 'vitest';

import { resolveManagedCalendarAvailability } from '../src/modules/calendar/calendar.service.js';

const baseline = {
  date: '2026-07-29',
  weekday: 3,
  today: '2026-07-29',
  holiday: false,
  leave: null,
  attendanceStatus: null,
} as const;

describe('managed calendar availability', () => {
  it('treats current and future working days as available planning capacity', () => {
    expect(resolveManagedCalendarAvailability(baseline)).toBe('available');
    expect(
      resolveManagedCalendarAvailability({ ...baseline, date: '2026-07-30', weekday: 4 }),
    ).toBe('available');
  });

  it('distinguishes missing past evidence from an explicit absence', () => {
    expect(
      resolveManagedCalendarAvailability({ ...baseline, date: '2026-07-28', weekday: 2 }),
    ).toBe('no_record');
    expect(resolveManagedCalendarAvailability({ ...baseline, attendanceStatus: 'absent' })).toBe(
      'unavailable',
    );
  });

  it('maps approved full and half-day leave without requiring a private reason', () => {
    expect(
      resolveManagedCalendarAvailability({
        ...baseline,
        leave: { status: 'approved', dayPart: 'full_day' },
      }),
    ).toBe('unavailable');
    expect(
      resolveManagedCalendarAvailability({
        ...baseline,
        leave: { status: 'approved', dayPart: 'first_half' },
      }),
    ).toBe('partial');
  });

  it('prioritizes pending leave and non-working days', () => {
    expect(
      resolveManagedCalendarAvailability({
        ...baseline,
        leave: { status: 'pending_manager', dayPart: 'full_day' },
      }),
    ).toBe('pending');
    expect(
      resolveManagedCalendarAvailability({ ...baseline, weekday: 7, attendanceStatus: 'present' }),
    ).toBe('non_working');
    expect(resolveManagedCalendarAvailability({ ...baseline, holiday: true })).toBe('non_working');
  });
});
