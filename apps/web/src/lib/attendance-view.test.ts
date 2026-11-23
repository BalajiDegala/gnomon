import { emptyWorkContext, type AttendanceDetailsRow } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import {
  buildAttendanceExport,
  countByStatus,
  filterRowsExceptStatus as filterRows,
  groupFor,
  workModeShortLabel,
  filterRowsExceptStatus,
  nextSort,
  orderRows,
  parseSort,
  serializeSort,
} from './attendance-view';

function row(overrides: Partial<AttendanceDetailsRow> & { id: string }): AttendanceDetailsRow {
  return {
    employeeId: overrides.id,
    employeeCode: `DDI${overrides.id}`,
    employeeDisplayName: `Person ${overrides.id}`,
    departmentName: 'Compositing',
    workDate: '2026-11-19',
    status: 'absent',
    requiresReview: false,
    biometric: { status: 'none', firstAt: null, lastAt: null, workedMinutes: 0, eventCount: 0 },
    accessCard: { status: 'none', firstAt: null, lastAt: null, workedMinutes: 0, eventCount: 0 },
    website: { status: 'none', firstAt: null, lastAt: null, workedMinutes: 0, sessionCount: 0 },
    timesheets: { totalMinutes: 0, entryCount: 0, averageProgress: 0 },
    payableMinutes: 0,
    anomalies: [],
    workContext: emptyWorkContext,
    ...overrides,
  };
}

const rows = [
  row({
    id: '1',
    employeeDisplayName: 'Charu',
    departmentName: 'Roto',
    status: 'present',
    payableMinutes: 540,
  }),
  row({ id: '2', employeeDisplayName: 'Asha', departmentName: 'Paint', status: 'absent' }),
  row({
    id: '3',
    employeeDisplayName: 'Bala',
    departmentName: 'Roto',
    status: 'partial',
    payableMinutes: 300,
    workContext: { ...emptyWorkContext, workMode: 'home', shiftName: 'Night shift' },
    website: {
      status: 'complete',
      firstAt: null,
      lastAt: null,
      workedMinutes: 300,
      sessionCount: 1,
    },
  }),
];

describe('attendance view', () => {
  it('round-trips sort rules through the URL format and rejects bad input', () => {
    const rules = [
      { key: 'department', direction: 'asc' },
      { key: 'payable', direction: 'desc' },
    ] as const;
    expect(parseSort(serializeSort(rules))).toEqual(rules);
    expect(parseSort('nope:asc')).toBeNull();
    expect(parseSort('date:up')).toBeNull();
    expect(parseSort('date:asc,date:desc')).toBeNull();
  });

  it('sorts by one column on click and adds levels on shift+click', () => {
    const start = [{ key: 'date', direction: 'desc' }] as const;
    expect(nextSort(start, 'date', false)).toEqual([{ key: 'date', direction: 'asc' }]);
    expect(nextSort(start, 'employee', false)).toEqual([{ key: 'employee', direction: 'asc' }]);
    expect(nextSort(start, 'payable', true)).toEqual([
      ...start,
      { key: 'payable', direction: 'desc' },
    ]);
  });

  it('applies multi-level sorting', () => {
    const ordered = orderRows(
      rows,
      [
        { key: 'department', direction: 'asc' },
        { key: 'payable', direction: 'desc' },
      ],
      'none',
    );
    expect(ordered.map((item) => item.employeeDisplayName)).toEqual(['Asha', 'Charu', 'Bala']);
  });

  it('orders groups naturally and sorts within each group', () => {
    const byStatus = orderRows(rows, [{ key: 'employee', direction: 'asc' }], 'status');
    expect(byStatus.map((item) => item.status)).toEqual(['absent', 'partial', 'present']);
  });

  it('puts the unassigned department group last', () => {
    const withUnassigned = [
      ...rows,
      row({ id: '4', employeeDisplayName: 'Dev', departmentName: null }),
    ];
    const ordered = orderRows(
      withUnassigned,
      [{ key: 'employee', direction: 'asc' }],
      'department',
    );
    expect(ordered.map((item) => item.departmentName)).toEqual(['Paint', 'Roto', 'Roto', null]);
  });

  it('filters by work mode, evidence and search, and counts statuses', () => {
    const home = filterRowsExceptStatus(rows, { search: '', workMode: 'home', source: 'all' });
    expect(home.map((item) => item.id)).toEqual(['3']);
    const noEvidence = filterRowsExceptStatus(rows, {
      search: '',
      workMode: 'all',
      source: 'noEvidence',
    });
    expect(noEvidence).toHaveLength(2);
    expect(
      filterRowsExceptStatus(rows, { search: 'night', workMode: 'all', source: 'all' }),
    ).toHaveLength(1);
    expect(countByStatus(rows)).toMatchObject({ absent: 1, partial: 1, present: 1, leave: 0 });
  });

  it('exports exactly the visible columns, in order, with the group first', () => {
    const csv = buildAttendanceExport(
      orderRows(rows, [{ key: 'employee', direction: 'asc' }], 'department'),
      ['employee', 'workMode', 'status'],
      'department',
    );
    expect(csv.headers).toEqual([
      'Department',
      'Employee',
      'Employee code',
      'Work mode',
      'Attendance',
      'Review required',
      'Anomalies',
    ]);
    expect(csv.rows.map((cells) => [cells[0], cells[1], cells[3], cells[4]])).toEqual([
      ['Paint', 'Asha', '', 'LOP'],
      ['Roto', 'Bala', 'WFH', 'Partial'],
      ['Roto', 'Charu', '', 'Present'],
    ]);
  });

  it('shows and filters a day that moved from office to home', () => {
    const mixed = row({
      id: '9',
      workContext: { ...emptyWorkContext, workMode: 'office', workModes: ['office', 'home'] },
    });
    expect(workModeShortLabel(mixed)).toBe('WFO → WFH');
    const base = { search: '', source: 'all' } as const;
    expect(filterRows([mixed], { ...base, workMode: 'office' })).toHaveLength(1);
    expect(filterRows([mixed], { ...base, workMode: 'home' })).toHaveLength(1);
    expect(filterRows([mixed], { ...base, workMode: 'undeclared' })).toHaveLength(0);
    expect(groupFor(mixed, 'workMode').label).toBe('Office and home (WFO → WFH)');
    expect(buildAttendanceExport([mixed], ['workMode'], 'none').rows[0]).toEqual(['WFO → WFH']);
  });
});
