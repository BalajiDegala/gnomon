import type { TimeEntryDto } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import {
  buildMyTimesheetExport,
  filterEntries,
  movePeriod,
  orderEntries,
  periodRange,
} from './my-timesheet-view';

function entry(overrides: Partial<TimeEntryDto> & { id: string }): TimeEntryDto {
  return {
    workDate: '2026-11-18',
    showId: 's1',
    showCode: 'VFX1',
    showName: 'Alpha',
    workSessionId: null,
    startedAt: null,
    endedAt: null,
    durationMinutes: 90,
    comment: 'Comp review',
    percentage: 100,
    ...overrides,
  };
}

describe('my timesheet view', () => {
  it('computes day, week (Mon–Sun) and month ranges', () => {
    expect(periodRange('day', '2026-11-19')).toEqual({ from: '2026-11-19', to: '2026-11-19' });
    expect(periodRange('week', '2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(movePeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
  });

  it('filters by search, show and progress band', () => {
    const rows = [
      entry({ id: '1' }),
      entry({ id: '2', showId: 's2', showName: 'Beta', percentage: 40, comment: 'Roto' }),
    ];
    expect(
      filterEntries(rows, { search: 'roto', showIds: [], progress: [] }).map((e) => e.id),
    ).toEqual(['2']);
    expect(
      filterEntries(rows, { search: '', showIds: ['s1'], progress: [] }).map((e) => e.id),
    ).toEqual(['1']);
    expect(
      filterEntries(rows, { search: '', showIds: [], progress: ['low'] }).map((e) => e.id),
    ).toEqual(['2']);
  });

  it('groups dates newest first and exports in column order', () => {
    const rows = [
      entry({ id: '1', workDate: '2026-11-17' }),
      entry({ id: '2', workDate: '2026-11-18' }),
    ];
    expect(orderEntries(rows, [], 'date').map((e) => e.id)).toEqual(['2', '1']);
    const csv = buildMyTimesheetExport(rows.slice(0, 1), ['hours', 'show'], 'none');
    expect(csv.headers).toEqual(['Hours', 'Show code', 'Show name']);
    expect(csv.rows[0]).toEqual([1.5, 'VFX1', 'Alpha']);
  });
});
