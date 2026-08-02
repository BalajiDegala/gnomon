import { describe, expect, it } from 'vitest';

import { WorkforceReportQuerySchema } from './reporting.js';

describe('reporting contracts', () => {
  it('accepts an ordered date range', () => {
    expect(
      WorkforceReportQuerySchema.safeParse({ dateFrom: '2026-07-01', dateTo: '2026-07-31' })
        .success,
    ).toBe(true);
  });

  it('rejects reversed and malformed date ranges', () => {
    expect(
      WorkforceReportQuerySchema.safeParse({ dateFrom: '2026-08-01', dateTo: '2026-07-01' })
        .success,
    ).toBe(false);
    expect(
      WorkforceReportQuerySchema.safeParse({ dateFrom: '01-07-2026', dateTo: '2026-07-31' })
        .success,
    ).toBe(false);
  });
});
