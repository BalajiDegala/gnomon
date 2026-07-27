import { describe, expect, it } from 'vitest';

import { TimesheetDecisionRequestSchema } from './timesheet.js';

describe('timesheet approval contract', () => {
  it('allows an approval without a comment', () => {
    expect(TimesheetDecisionRequestSchema.parse({ decision: 'approved', comment: '' })).toEqual({
      decision: 'approved',
      comment: '',
    });
  });

  it('requires a useful rejection reason', () => {
    expect(() =>
      TimesheetDecisionRequestSchema.parse({ decision: 'rejected', comment: 'no' }),
    ).toThrow('A rejection reason is required');

    expect(
      TimesheetDecisionRequestSchema.parse({
        decision: 'rejected',
        comment: 'Please separate production and review time.',
      }),
    ).toMatchObject({ decision: 'rejected' });
  });
});
