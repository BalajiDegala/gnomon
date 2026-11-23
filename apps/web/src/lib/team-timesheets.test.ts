import type { TeamTimesheetRow } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import {
  buildTimesheetExport,
  filterTimesheets,
  nextTimesheetSort,
  orderTimesheets,
  parseTimesheetSort,
  presetRange,
  summarizeTimesheets,
  UNASSIGNED_DEPARTMENT,
} from './team-timesheets';

function entry(overrides: Partial<TeamTimesheetRow> & { id: string }): TeamTimesheetRow {
  return {
    employeeId: 'e1',
    employeeCode: 'DDIH1',
    employeeDisplayName: 'Asha Rao',
    departmentName: 'Compositing',
    workDate: '2026-11-18',
    showId: 's1',
    showCode: 'AVA',
    showName: 'Avalon',
    startedAt: '2026-11-18T04:00:00.000Z',
    endedAt: '2026-11-18T06:00:00.000Z',
    durationMinutes: 120,
    percentage: 50,
    comment: 'Comp v3',
    ...overrides,
  };
}

const rows = [
  entry({ id: '1' }),
  entry({
    id: '2',
    employeeId: 'e2',
    employeeDisplayName: 'Bala',
    departmentName: 'Roto',
    showId: 's2',
    showCode: 'BRK',
    showName: 'Breaker',
    durationMinutes: 360,
    percentage: 100,
    comment: 'Roto cleanup',
  }),
  entry({
    id: '3',
    employeeId: 'e3',
    employeeDisplayName: 'Charu',
    departmentName: null,
    workDate: '2026-11-19',
  }),
];

describe('team timesheets', () => {
  it('computes Monday-based week and month presets', () => {
    expect(presetRange('thisWeek', '2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-19' });
    expect(presetRange('lastWeek', '2026-11-19')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(presetRange('thisMonth', '2026-11-19')).toEqual({
      from: '2026-11-01',
      to: '2026-11-19',
    });
    expect(presetRange('lastMonth', '2026-01-10')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('filters by department (including unassigned), show and search', () => {
    const base = { search: '', departments: [], showIds: [] };
    expect(filterTimesheets(rows, { ...base, departments: ['Roto'] }).map((r) => r.id)).toEqual([
      '2',
    ]);
    expect(
      filterTimesheets(rows, { ...base, departments: [UNASSIGNED_DEPARTMENT] }).map((r) => r.id),
    ).toEqual(['3']);
    expect(filterTimesheets(rows, { ...base, showIds: ['s1'] }).map((r) => r.id)).toEqual([
      '1',
      '3',
    ]);
    expect(filterTimesheets(rows, { ...base, search: 'cleanup' }).map((r) => r.id)).toEqual(['2']);
  });

  it('sorts with multiple levels and groups by show', () => {
    expect(nextTimesheetSort([{ key: 'date', direction: 'desc' }], 'duration', true)).toEqual([
      { key: 'date', direction: 'desc' },
      { key: 'duration', direction: 'desc' },
    ]);
    expect(parseTimesheetSort('show:asc,duration:desc')).toHaveLength(2);
    expect(parseTimesheetSort('bogus:asc')).toBeNull();
    const byShow = orderTimesheets(rows, [{ key: 'employee', direction: 'asc' }], 'show');
    expect(byShow.map((r) => r.showCode)).toEqual(['AVA', 'AVA', 'BRK']);
  });

  it('weights average progress by time spent', () => {
    const summary = summarizeTimesheets(rows.slice(0, 2));
    expect(summary).toMatchObject({ minutes: 480, entries: 2, people: 2, shows: 2 });
    // (50% × 120 + 100% × 360) / 480 = 87.5 → 88
    expect(summary.averageProgress).toBe(88);
  });

  it('exports the grouped view with the group first', () => {
    const csv = buildTimesheetExport(orderTimesheets(rows, [], 'department'), 'department');
    expect(csv.headers.slice(0, 3)).toEqual(['Department', 'Employee', 'Employee code']);
    expect(csv.rows.map((cells) => cells[0])).toEqual([
      'Compositing',
      'Roto',
      'Unassigned department',
    ]);
  });

  it('exports columns in the order shown in the grid', () => {
    const csv = buildTimesheetExport([entry({ id: '1' })], 'none', [
      'duration',
      'employee',
      'department',
      'date',
      'show',
      'progress',
      'comment',
    ]);
    expect(csv.headers.slice(0, 3)).toEqual(['Duration (minutes)', 'Duration', 'Employee']);
  });
});
