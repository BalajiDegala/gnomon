import { describe, expect, it } from 'vitest';

import {
  CreateRegularisationRequestSchema,
  RegularisationDecisionRequestSchema,
} from './regularisation.js';

describe('regularisation contracts', () => {
  it('requires a meaningful employee reason', () => {
    expect(() =>
      CreateRegularisationRequestSchema.parse({
        workDate: '2026-07-24',
        source: 'biometric',
        missingEvent: 'closing',
        requestedStart: '2026-07-24T03:30:00.000Z',
        requestedEnd: '2026-07-24T12:30:00.000Z',
        reason: 'missed',
      }),
    ).toThrow();
  });

  it('requires a rejection comment but permits an empty approval comment', () => {
    expect(() =>
      RegularisationDecisionRequestSchema.parse({ decision: 'rejected', comment: '' }),
    ).toThrow('rejection reason');
    expect(
      RegularisationDecisionRequestSchema.parse({ decision: 'approved', comment: '' }),
    ).toEqual({ decision: 'approved', comment: '' });
  });

  it('accepts corrections for imported access-card entry and exit events', () => {
    expect(
      CreateRegularisationRequestSchema.safeParse({
        workDate: '2026-06-30',
        source: 'access_card',
        missingEvent: 'closing',
        requestedStart: '2026-06-30T03:30:00.000Z',
        requestedEnd: '2026-06-30T12:30:00.000Z',
        reason: 'The exterior gate exit swipe was not captured.',
      }).success,
    ).toBe(true);
  });
});
