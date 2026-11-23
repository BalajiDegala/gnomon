import { ShiftRequestSchema, shiftDurationMinutes } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import { workContextFromSessions } from '../src/modules/timecard/timecard.service.js';

describe('shifts', () => {
  it('measures day and overnight shifts', () => {
    expect(shiftDurationMinutes('09:00', '18:00')).toBe(540);
    expect(shiftDurationMinutes('21:00', '06:00')).toBe(540);
  });

  it('rejects equal start/end times and an inactive default shift', () => {
    const base = { name: 'Night shift', startTime: '21:00', endTime: '06:00' };
    expect(ShiftRequestSchema.safeParse(base).success).toBe(true);
    expect(ShiftRequestSchema.safeParse({ ...base, endTime: '21:00' }).success).toBe(false);
    expect(ShiftRequestSchema.safeParse({ ...base, isDefault: true, active: false }).success).toBe(
      false,
    );
  });

  it('uses the first declared session as the work context for the day', () => {
    const context = workContextFromSessions([
      { startedAt: new Date('2026-07-27T08:00:00Z'), shiftName: 'Late', workMode: 'office' },
      {
        startedAt: new Date('2026-07-27T03:00:00Z'),
        shiftId: 'abc',
        shiftName: 'Standard shift',
        shiftStartTime: '09:00',
        shiftEndTime: '18:00',
        workMode: 'home',
      },
    ]);
    expect(context).toEqual({
      shiftId: 'abc',
      shiftName: 'Standard shift',
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      workMode: 'home',
      workModes: ['home', 'office'],
    });
    expect(workContextFromSessions([{ startedAt: new Date() }]).workMode).toBeNull();
  });
});
