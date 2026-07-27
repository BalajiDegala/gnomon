import { describe, expect, it } from 'vitest';

import { UpdateLeaveBalanceRequestSchema, UpsertHolidayRequestSchema } from './policy.js';

describe('holiday and leave policy contracts', () => {
  it('accepts a company holiday without a location', () => {
    expect(
      UpsertHolidayRequestSchema.parse({ date: '2026-08-15', name: 'Independence Day' }),
    ).toMatchObject({ scopeType: 'company', locationId: null });
  });

  it('requires location scope and identifier to agree', () => {
    expect(() =>
      UpsertHolidayRequestSchema.parse({
        date: '2026-09-01',
        name: 'Local holiday',
        scopeType: 'location',
      }),
    ).toThrow('location identifier');
  });

  it('allows signed balance adjustments but not unpaid entitlements', () => {
    expect(
      UpdateLeaveBalanceRequestSchema.parse({
        leaveType: 'earned',
        year: 2026,
        entitledDays: 18,
        adjustedDays: -1,
      }),
    ).toMatchObject({ adjustedDays: -1, note: '' });
    expect(() =>
      UpdateLeaveBalanceRequestSchema.parse({
        leaveType: 'unpaid',
        year: 2026,
        entitledDays: 10,
      }),
    ).toThrow();
  });
});
