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
      anomalies: ['missing_biometric_in', 'missing_biometric_out'],
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
    });
    expect(merged).toBeDefined();
    expect(mergeAttendanceRows([row({}), accessCardRow])).toHaveLength(1);
  });
});
