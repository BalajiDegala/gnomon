import { describe, expect, it } from 'vitest';

import {
  CompanyHolidayRequestSchema,
  CreateLocationRequestSchema,
  UpdateEmployeeLocationRequestSchema,
  UpdateLeaveBalanceRequestSchema,
  UpsertHolidayRequestSchema,
} from './policy.js';

describe('holiday and leave policy contracts', () => {
  it('accepts a company holiday without a location', () => {
    expect(
      UpsertHolidayRequestSchema.parse({ date: '2026-08-15', name: 'Independence Day' }),
    ).toMatchObject({ scopeType: 'company', locationId: null });
  });

  it('keeps the active holiday API company-wide', () => {
    expect(
      CompanyHolidayRequestSchema.parse({ date: '2026-10-02', name: 'Gandhi Jayanti' }),
    ).toEqual({ date: '2026-10-02', name: 'Gandhi Jayanti' });
    expect(
      CompanyHolidayRequestSchema.safeParse({
        date: '2026-10-02',
        name: 'Local holiday',
        scopeType: 'location',
      }).success,
    ).toBe(false);
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

  it('normalizes location codes and accepts an explicit unassigned location', () => {
    expect(CreateLocationRequestSchema.parse({ code: 'mum-01', name: 'Mumbai Studio' })).toEqual({
      code: 'MUM-01',
      name: 'Mumbai Studio',
    });
    expect(UpdateEmployeeLocationRequestSchema.parse({ locationId: null })).toEqual({
      locationId: null,
    });
  });
});
