import { describe, expect, it } from 'vitest';

import { CreateLeaveRequestSchema, LeaveDecisionRequestSchema } from './leave.js';

describe('leave contracts', () => {
  it('accepts a single-day half-day request', () => {
    expect(
      CreateLeaveRequestSchema.parse({
        leaveType: 'casual',
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        dayPart: 'first_half',
        reason: 'Personal appointment',
      }).dayPart,
    ).toBe('first_half');
  });

  it('rejects half-day leave across multiple dates', () => {
    expect(() =>
      CreateLeaveRequestSchema.parse({
        leaveType: 'casual',
        startDate: '2026-08-03',
        endDate: '2026-08-04',
        dayPart: 'second_half',
        reason: 'Personal appointment',
      }),
    ).toThrow('Half-day leave');
  });

  it('requires a rejection reason but permits approval without a comment', () => {
    expect(() => LeaveDecisionRequestSchema.parse({ decision: 'rejected' })).toThrow(
      'rejection reason',
    );
    expect(LeaveDecisionRequestSchema.parse({ decision: 'approved' })).toEqual({
      decision: 'approved',
      comment: '',
    });
  });
});
