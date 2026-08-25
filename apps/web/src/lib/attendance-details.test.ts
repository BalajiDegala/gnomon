import { describe, expect, it } from 'vitest';

import type { AttendanceDetailsRow } from '@gnomon/shared';

import { mergeAttendanceRows } from './attendance-details';

function row(overrides: Partial<AttendanceDetailsRow>): AttendanceDetailsRow {
  return {
    id: 'biometric-row',
    employeeId: 'biometric-employee',
    employeeCode: 'DDIH667',
    employeeDisplayName: 'Abhishek Donikena',
    departmentName: 'Production',
    workDate: '2026-06-30',
    status: 'present',
    requiresReview: true,
    biometric: {
      status: 'complete',
      firstAt: '2026-06-30T02:36:45.000Z',
      lastAt: '2026-06-30T13:50:45.000Z',
      workedMinutes: 674,
      eventCount: 2,
    },
    accessCard: {
      status: 'none',
      firstAt: null,
      lastAt: null,
      workedMinutes: 0,
      eventCount: 0,
    },
    website: {
      status: 'none',
      firstAt: null,
      lastAt: null,
      workedMinutes: 0,
      sessionCount: 0,
    },
    timesheets: { totalMinutes: 0, entryCount: 0, averageProgress: 0 },
    payableMinutes: 674,
    anomalies: ['missing_access_entry', 'missing_access_exit'],
    ...overrides,
  };
}

describe('mergeAttendanceRows', () => {
  it('combines biometric and access-card rows for the same personnel and date', () => {
    const accessCardRow = row({
      id: 'access-card-row',
      employeeId: 'access-card-employee',
      employeeCode: '667',
      employeeDisplayName: 'Abhishek Donikena Donikena',
      departmentName: 'Department Name',
      status: 'partial',
      biometric: {
        status: 'none',
        firstAt: null,
        lastAt: null,
        workedMinutes: 0,
        eventCount: 0,
      },
      accessCard: {
        status: 'complete',
        firstAt: '2026-06-30T02:36:53.000Z',
        lastAt: '2026-06-30T13:50:27.000Z',
        workedMinutes: 673,
        eventCount: 2,
      },
      website: {
        status: 'complete',
        firstAt: '2026-06-30T02:37:00.000Z',
        lastAt: '2026-06-30T13:50:00.000Z',
        workedMinutes: 673,
        sessionCount: 1,
      },
      timesheets: { totalMinutes: 480, entryCount: 2, averageProgress: 90 },
      anomalies: [
        'missing_biometric_in',
        'missing_biometric_out',
        'missing_web_start',
        'missing_web_stop',
      ],
    });

    const [merged] = mergeAttendanceRows([row({}), accessCardRow]);

    expect(merged).toMatchObject({
      employeeId: 'biometric-employee',
      employeeCode: 'DDIH667',
      employeeDisplayName: 'Abhishek Donikena',
      departmentName: 'Production',
      workDate: '2026-06-30',
      status: 'present',
      requiresReview: false,
      biometric: { eventCount: 2, status: 'complete' },
      accessCard: { eventCount: 2, status: 'complete' },
      website: { sessionCount: 1, status: 'complete' },
      timesheets: { entryCount: 2, totalMinutes: 480 },
    });
    expect(merged).toBeDefined();
    expect(mergeAttendanceRows([row({}), accessCardRow])).toHaveLength(1);
  });

  it.each([
    {
      label: 'no events',
      firstAt: null,
      lastAt: null,
      eventCount: 0,
      biometricStatus: 'none',
      accessStatus: 'none',
    },
    {
      label: 'missing first event',
      firstAt: null,
      lastAt: '2026-06-30T13:50:00.000Z',
      eventCount: 1,
      biometricStatus: 'missing_in',
      accessStatus: 'missing_entry',
    },
    {
      label: 'missing last event',
      firstAt: '2026-06-30T02:37:00.000Z',
      lastAt: null,
      eventCount: 1,
      biometricStatus: 'missing_out',
      accessStatus: 'missing_exit',
    },
    {
      label: 'invalid event order',
      firstAt: '2026-06-30T13:50:00.000Z',
      lastAt: '2026-06-30T02:37:00.000Z',
      eventCount: 2,
      biometricStatus: 'invalid',
      accessStatus: 'invalid',
    },
  ] as const)(
    'derives $label source statuses while merging',
    ({ firstAt, lastAt, eventCount, biometricStatus, accessStatus }) => {
      const biometric = {
        status: biometricStatus,
        firstAt,
        lastAt,
        workedMinutes: 0,
        eventCount,
      };
      const accessCard = {
        status: accessStatus,
        firstAt,
        lastAt,
        workedMinutes: 0,
        eventCount,
      };
      const [merged] = mergeAttendanceRows([
        row({ biometric, accessCard, status: 'partial', anomalies: ['insufficient_hours'] }),
        row({
          id: 'second-row',
          employeeId: 'second-employee',
          employeeCode: '667',
          biometric,
          accessCard,
          status: 'absent',
          anomalies: [],
        }),
      ]);

      expect(merged?.biometric.status).toBe(biometricStatus);
      expect(merged?.accessCard.status).toBe(accessStatus);
      expect(merged?.status).toBe('partial');
      expect(merged?.requiresReview).toBe(true);
    },
  );

  it('keeps different personnel and work dates as separate attendance rows', () => {
    const rows = mergeAttendanceRows([
      row({ employeeId: 'alpha', employeeCode: 'HR-A' }),
      row({ employeeId: 'beta', employeeCode: 'HR-B' }),
      row({ id: 'next-day', employeeCode: '667', workDate: '2026-07-01' }),
    ]);

    expect(rows).toHaveLength(3);
  });
});
