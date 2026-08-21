import { describe, expect, it } from 'vitest';

import { ManagedCalendarDayDtoSchema, ManagedCalendarQuerySchema } from './calendar.js';

describe('managed calendar contracts', () => {
  it('requires an authorized show identifier when selecting a show audience', () => {
    expect(() => ManagedCalendarQuerySchema.parse({ audienceType: 'show' })).toThrow(
      'A show is required',
    );
    expect(
      ManagedCalendarQuerySchema.parse({
        month: '2026-07',
        audienceType: 'show',
        showId: '507f1f77bcf86cd799439011',
      }),
    ).toEqual({
      month: '2026-07',
      audienceType: 'show',
      showId: '507f1f77bcf86cd799439011',
      page: 1,
      pageSize: 25,
    });
  });

  it('does not retain private leave reason fields in availability output', () => {
    const day = ManagedCalendarDayDtoSchema.parse({
      date: '2026-07-29',
      weekday: 3,
      availability: 'unavailable',
      attendanceStatus: 'leave',
      leave: { dayPart: 'full_day', status: 'approved', reason: 'Private medical detail' },
      holiday: null,
    });

    expect(day.leave).toEqual({ dayPart: 'full_day', status: 'approved' });
    expect(day.leave).not.toHaveProperty('reason');
  });
});
