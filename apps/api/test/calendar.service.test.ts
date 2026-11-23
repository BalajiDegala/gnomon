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
  it('mirrors the recorded attendance status exactly', () => {
    expect(resolveManagedCalendarAvailability({ ...baseline, attendanceStatus: 'present' })).toBe(
      'present',
    );
    expect(resolveManagedCalendarAvailability({ ...baseline, attendanceStatus: 'partial' })).toBe(
      'partial',
    );
    expect(resolveManagedCalendarAvailability({ ...baseline, attendanceStatus: 'absent' })).toBe(
      'absent',
    );
    expect(resolveManagedCalendarAvailability({ ...baseline, attendanceStatus: 'leave' })).toBe(
      'leave',
    );
    expect(
      resolveManagedCalendarAvailability({
        ...baseline,
        attendanceStatus: 'pending_regularisation',
      }),
    ).toBe('pending');
  });

  it('lets recorded attendance win over leave, matching Attendance details', () => {
    expect(
      resolveManagedCalendarAvailability({
        ...baseline,
        attendanceStatus: 'absent',
        leave: { status: 'pending_manager', dayPart: 'full_day' },
      }),
    ).toBe('absent');
  });

  it('treats today without a record as LOP, future days as upcoming, past days as no record', () => {
    expect(resolveManagedCalendarAvailability(baseline)).toBe('absent');
    expect(
      resolveManagedCalendarAvailability({ ...baseline, date: '2026-07-30', weekday: 4 }),
    ).toBe('upcoming');
    expect(
      resolveManagedCalendarAvailability({ ...baseline, date: '2026-07-28', weekday: 2 }),
    ).toBe('no_record');
  });

  it('uses leave for days that have no attendance record yet', () => {
    const future = { ...baseline, date: '2026-07-30', weekday: 4 };
    expect(
      resolveManagedCalendarAvailability({
        ...future,
        leave: { status: 'approved', dayPart: 'full_day' },
      }),
    ).toBe('leave');
    expect(
      resolveManagedCalendarAvailability({
        ...future,
        leave: { status: 'approved', dayPart: 'first_half' },
      }),
    ).toBe('partial');
    expect(
      resolveManagedCalendarAvailability({
        ...future,
        leave: { status: 'pending_hr', dayPart: 'full_day' },
      }),
    ).toBe('pending');
  });

  it('marks weekends and holidays as off', () => {
    expect(
      resolveManagedCalendarAvailability({ ...baseline, weekday: 7, attendanceStatus: 'present' }),
    ).toBe('non_working');
    expect(resolveManagedCalendarAvailability({ ...baseline, holiday: true })).toBe('non_working');
  });
});
