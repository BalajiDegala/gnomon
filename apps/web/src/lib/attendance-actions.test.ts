import { describe, expect, it } from 'vitest';

import { correctedWindow, defaultLeaveType, indiaTimeInput } from './attendance-actions';

describe('attendance action helpers', () => {
  it('formats instants as India time and builds corrected windows', () => {
    expect(indiaTimeInput('2026-11-18T04:00:00.000Z')).toBe('09:30');
    expect(correctedWindow('2026-11-18', '09:30', '18:30')).toEqual({
      requestedStart: '2026-11-18T04:00:00.000Z',
      requestedEnd: '2026-11-18T13:00:00.000Z',
    });
    // Night shift: end before start rolls into the next day.
    expect(correctedWindow('2026-11-18', '21:00', '06:00').requestedEnd).toBe(
      '2026-11-19T00:30:00.000Z',
    );
  });

  it('defaults to paid leave with balance, otherwise unpaid', () => {
    const balance = (leaveType: 'casual' | 'earned' | 'comp_off', availableDays: number) => ({
      leaveType,
      year: 2026,
      entitledDays: 10,
      adjustedDays: 0,
      pendingDays: 0,
      approvedDays: 0,
      availableDays,
      balanceTracked: true,
    });
    expect(defaultLeaveType([balance('casual', 0), balance('earned', 2)])).toBe('earned');
    expect(defaultLeaveType([balance('casual', 0)])).toBe('unpaid');
  });
});
