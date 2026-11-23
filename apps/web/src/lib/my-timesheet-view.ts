import type { TimeEntryDto } from '@gnomon/shared';

import type { CsvValue } from './csv';

export const timesheetPeriods = ['day', 'week', 'month'] as const;
export type TimesheetPeriod = (typeof timesheetPeriods)[number];

function shift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Date range shown for a period around the selected date (weeks run Monday–Sunday). */
export function periodRange(period: TimesheetPeriod, date: string): { from: string; to: string } {
  if (period === 'day') return { from: date, to: date };
  if (period === 'week') {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    const from = shift(date, 1 - weekday);
    return { from, to: shift(from, 6) };
  }
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: shift(next.toISOString().slice(0, 10), -1) };
}

/** Moves the selected date by one period. */
export function movePeriod(period: TimesheetPeriod, date: string, step: -1 | 1): string {
  if (period === 'day') return shift(date, step);
  if (period === 'week') return shift(date, step * 7);
  const value = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + step);
  return value.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ columns */

export const myTimesheetColumnIds = ['date', 'show', 'comment', 'hours', 'progress'] as const;
export type MyTimesheetColumnId = (typeof myTimesheetColumnIds)[number];
export const myTimesheetColumnLabels: Record<MyTimesheetColumnId, string> = {
  date: 'Date',
  show: 'Show',
  comment: 'Work comment',
  hours: 'Hours',
  progress: 'Progress',
};

/* ------------------------------------------------------------ filters */

export interface MyTimesheetFilters {
  search: string;
  showIds: readonly string[];
  progress: readonly string[];
}

export const progressBands = [
  { value: 'low', label: 'Under 50%', test: (value: number) => value < 50 },
  { value: 'mid', label: '50–90%', test: (value: number) => value >= 50 && value < 100 },
  { value: 'done', label: '100% (done)', test: (value: number) => value === 100 },
] as const;

export function filterEntries(entries: readonly TimeEntryDto[], filters: MyTimesheetFilters) {
  const term = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.showIds.length && !filters.showIds.includes(entry.showId)) return false;
    if (
      filters.progress.length &&
      !progressBands.some(
        (band) => filters.progress.includes(band.value) && band.test(entry.percentage),
      )
    ) {
      return false;
    }
    if (!term) return true;
    return [entry.showCode, entry.showName, entry.comment, entry.workDate].some((value) =>
      value.toLowerCase().includes(term),
    );
  });
}

/* ------------------------------------------------------------ sorting */

export interface MyTimesheetSortRule {
  key: MyTimesheetColumnId;
  direction: 'asc' | 'desc';
}
export const defaultMyTimesheetSort: readonly MyTimesheetSortRule[] = [
  { key: 'date', direction: 'desc' },
  { key: 'show', direction: 'asc' },
];

export function parseMyTimesheetSort(value: string): MyTimesheetSortRule[] | null {
  const rules: MyTimesheetSortRule[] = [];
  for (const part of value.split(',')) {
    const [key, direction] = part.split(':');
    if (!myTimesheetColumnIds.includes(key as MyTimesheetColumnId)) return null;
    if (direction !== 'asc' && direction !== 'desc') return null;
    if (rules.some((rule) => rule.key === key)) return null;
    rules.push({ key: key as MyTimesheetColumnId, direction });
  }
  return rules.length > 0 && rules.length <= 3 ? rules : null;
}

export function serializeMyTimesheetSort(rules: readonly MyTimesheetSortRule[]): string {
  return rules.map((rule) => `${rule.key}:${rule.direction}`).join(',');
}

export function nextMyTimesheetSort(
  rules: readonly MyTimesheetSortRule[],
  key: MyTimesheetColumnId,
  additive: boolean,
): MyTimesheetSortRule[] {
  const initial: 'asc' | 'desc' = key === 'date' || key === 'hours' ? 'desc' : 'asc';
  const existing = rules.find((rule) => rule.key === key);
  const flip = (rule: MyTimesheetSortRule): MyTimesheetSortRule => ({
    ...rule,
    direction: rule.direction === 'asc' ? 'desc' : 'asc',
  });
  if (additive) {
    if (existing) return rules.map((rule) => (rule.key === key ? flip(rule) : rule));
    return [...rules, { key, direction: initial }].slice(-3);
  }
  if (existing && rules[0]?.key === key) return [flip(existing)];
  return [{ key, direction: initial }];
}

function sortValue(entry: TimeEntryDto, key: MyTimesheetColumnId): string | number {
  switch (key) {
    case 'date':
      return entry.workDate;
    case 'show':
      return `${entry.showName} ${entry.showCode}`;
    case 'comment':
      return entry.comment;
    case 'hours':
      return entry.durationMinutes;
    case 'progress':
      return entry.percentage;
  }
}

/* ------------------------------------------------------------ grouping */

export const myTimesheetGroupOptions = ['none', 'date', 'show', 'progress'] as const;
export type MyTimesheetGroupBy = (typeof myTimesheetGroupOptions)[number];
export const myTimesheetGroupLabels: Record<MyTimesheetGroupBy, string> = {
  none: 'No grouping',
  date: 'Date',
  show: 'Show',
  progress: 'Progress',
};

export function entryGroupFor(
  entry: TimeEntryDto,
  groupBy: Exclude<MyTimesheetGroupBy, 'none'>,
): { key: string; label: string; secondary?: string } {
  if (groupBy === 'date') {
    const label = new Date(`${entry.workDate}T00:00:00Z`).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return { key: `date:${entry.workDate}`, label };
  }
  if (groupBy === 'show') {
    return { key: `show:${entry.showId}`, label: entry.showName, secondary: entry.showCode };
  }
  const band = progressBands.find((candidate) => candidate.test(entry.percentage))!;
  return { key: `progress:${band.value}`, label: band.label };
}

export function orderEntries(
  entries: readonly TimeEntryDto[],
  rules: readonly MyTimesheetSortRule[],
  groupBy: MyTimesheetGroupBy,
): TimeEntryDto[] {
  return entries.slice().sort((left, right) => {
    if (groupBy !== 'none') {
      const leftGroup = entryGroupFor(left, groupBy);
      const rightGroup = entryGroupFor(right, groupBy);
      if (leftGroup.key !== rightGroup.key) {
        // Newest dates first; shows and progress bands alphabetically/in band order.
        if (groupBy === 'date') return rightGroup.key.localeCompare(leftGroup.key);
        if (groupBy === 'progress') {
          const order = progressBands.map((band) => `progress:${band.value}`);
          return order.indexOf(leftGroup.key) - order.indexOf(rightGroup.key);
        }
        return leftGroup.label.localeCompare(rightGroup.label);
      }
    }
    for (const rule of rules) {
      const leftValue = sortValue(left, rule.key);
      const rightValue = sortValue(right, rule.key);
      const result =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    return left.id.localeCompare(right.id);
  });
}

/* --------------------------------------------------------------- export */

export function buildMyTimesheetExport(
  entries: readonly TimeEntryDto[],
  columnIds: readonly MyTimesheetColumnId[],
  groupBy: MyTimesheetGroupBy,
): { headers: string[]; rows: CsvValue[][] } {
  const grouped = groupBy !== 'none';
  const headers = columnIds.flatMap((id) =>
    id === 'show'
      ? ['Show code', 'Show name']
      : id === 'hours'
        ? ['Hours']
        : [myTimesheetColumnLabels[id]],
  );
  const cells = (entry: TimeEntryDto, id: MyTimesheetColumnId): CsvValue[] => {
    switch (id) {
      case 'date':
        return [entry.workDate];
      case 'show':
        return [entry.showCode, entry.showName];
      case 'comment':
        return [entry.comment];
      case 'hours':
        return [Math.round((entry.durationMinutes / 60) * 100) / 100];
      case 'progress':
        return [entry.percentage];
    }
  };
  return {
    headers: [...(grouped ? [myTimesheetGroupLabels[groupBy]] : []), ...headers],
    rows: entries.map((entry) => [
      ...(grouped ? [entryGroupFor(entry, groupBy).label] : []),
      ...columnIds.flatMap((id) => cells(entry, id)),
    ]),
  };
}
