import { describe, expect, it } from 'vitest';

import { AttendanceDetailsDtoSchema, WorkforceReportQuerySchema } from './reporting.js';

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

  it('describes which recorded months contain each attendance source', () => {
    const result = AttendanceDetailsDtoSchema.safeParse({
      month: '2026-07',
      latestRecordedMonth: '2026-08',
      availableMonths: [
        {
          month: '2026-07',
          attendanceDays: 1,
          employeesWithRecords: 1,
          biometricDays: 1,
          biometricEvents: 2,
          accessCardDays: 0,
          accessCardEvents: 0,
          websiteDays: 0,
          websiteSessions: 0,
          timesheetDays: 0,
          timesheetEntries: 0,
        },
      ],
      generatedAt: '2026-08-13T12:00:00.000Z',
      summary: {
        scopedEmployees: 1,
        employeesWithRecords: 1,
        attendanceDays: 1,
        completeBiometricDays: 1,
        completeAccessCardDays: 0,
        websiteSessionDays: 0,
        timesheetDays: 0,
      },
      rows: [],
    });

    expect(result.success).toBe(true);
  });
});
