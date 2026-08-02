import { describe, expect, it } from 'vitest';

import { assertReportDateRange } from '../src/modules/reporting/reporting.service.js';

describe('workforce report date range', () => {
  it('accepts a 92-day reporting window', () => {
    expect(() =>
      assertReportDateRange({ dateFrom: '2026-05-02', dateTo: '2026-08-01' }),
    ).not.toThrow();
  });

  it('rejects a reporting window longer than 92 days', () => {
    expect(() =>
      assertReportDateRange({ dateFrom: '2026-05-01', dateTo: '2026-08-01' }),
    ).toThrowError(/limited to 92 days/i);
  });
});
