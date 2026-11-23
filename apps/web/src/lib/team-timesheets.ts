import type { TeamTimesheetDto, TeamTimesheetRow } from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import type { CsvValue } from './csv';

export const TEAM_TIMESHEET_PERMISSIONS = [
  'attendance:team:read',
  'attendance:all:read',
  'audit:read',
  'show:manage',
] as const;

export function useTeamTimesheets(dateFrom: string, dateTo: string) {
  const { request, user } = useAuth();
  const canRead =
    user?.permissions.some((permission) =>
      (TEAM_TIMESHEET_PERMISSIONS as readonly string[]).includes(permission),
    ) ?? false;
  const query = useQuery({
    queryKey: ['team-timesheets', dateFrom, dateTo],
    queryFn: () =>
      request<{ timesheets: TeamTimesheetDto }>(
        `/api/v1/reports/timesheets?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      ),
    enabled: canRead && Boolean(dateFrom && dateTo) && dateFrom <= dateTo,
  });
  return {
    canRead,
    timesheets: query.data?.timesheets,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/* ----------------------------------------------------------------- dates */

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in India, as an ISO date. */
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export const datePresets = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'] as const;
export type DatePreset = (typeof datePresets)[number];
export const datePresetLabels: Record<DatePreset, string> = {
  thisWeek: 'This week',
  lastWeek: 'Last week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
};

/** Weeks start on Monday. */
export function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  const date = new Date(`${today}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  const monday = new Date(date.getTime() - (weekday - 1) * 86_400_000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (preset) {
    case 'thisWeek':
      return { from: isoDate(monday), to: today };
    case 'lastWeek':
      return {
        from: isoDate(new Date(monday.getTime() - 7 * 86_400_000)),
        to: isoDate(new Date(monday.getTime() - 86_400_000)),
      };
    case 'thisMonth':
      return { from: isoDate(new Date(Date.UTC(year, month, 1))), to: today };
    case 'lastMonth':
      return {
        from: isoDate(new Date(Date.UTC(year, month - 1, 1))),
        to: isoDate(new Date(Date.UTC(year, month, 0))),
      };
  }
}

/* ------------------------------------------------------------ formatting */

export function formatHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function formatDay(workDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${workDate}T00:00:00.000Z`));
}

/* ------------------------------------------------- filter / sort / group */

export const timesheetSortKeys = [
  'employee',
  'department',
  'date',
  'show',
  'duration',
  'progress',
] as const;
export type TimesheetSortKey = (typeof timesheetSortKeys)[number];
export interface TimesheetSortRule {
  key: TimesheetSortKey;
  direction: 'asc' | 'desc';
}
export const defaultTimesheetSort: readonly TimesheetSortRule[] = [
  { key: 'date', direction: 'desc' },
  { key: 'employee', direction: 'asc' },
];

export function parseTimesheetSort(value: string): TimesheetSortRule[] | null {
  const rules: TimesheetSortRule[] = [];
  for (const part of value.split(',')) {
    const [key, direction] = part.split(':');
    if (!timesheetSortKeys.includes(key as TimesheetSortKey)) return null;
    if (direction !== 'asc' && direction !== 'desc') return null;
    if (rules.some((rule) => rule.key === key)) return null;
    rules.push({ key: key as TimesheetSortKey, direction });
  }
  return rules.length > 0 && rules.length <= 3 ? rules : null;
}

export function serializeTimesheetSort(rules: readonly TimesheetSortRule[]): string {
  return rules.map((rule) => `${rule.key}:${rule.direction}`).join(',');
}

function initialDirection(key: TimesheetSortKey): 'asc' | 'desc' {
  return key === 'date' || key === 'duration' || key === 'progress' ? 'desc' : 'asc';
}

/** Click sorts by one column; Shift+click adds or flips a level (max three). */
export function nextTimesheetSort(
  rules: readonly TimesheetSortRule[],
  key: TimesheetSortKey,
  additive: boolean,
): TimesheetSortRule[] {
  const existing = rules.find((rule) => rule.key === key);
  const flip = (rule: TimesheetSortRule): TimesheetSortRule => ({
    ...rule,
    direction: rule.direction === 'asc' ? 'desc' : 'asc',
  });
  if (additive) {
    if (existing) return rules.map((rule) => (rule.key === key ? flip(rule) : rule));
    return [...rules, { key, direction: initialDirection(key) }].slice(-3);
  }
  if (existing && rules[0]?.key === key) return [flip(existing)];
  return [{ key, direction: initialDirection(key) }];
}

function sortValue(row: TeamTimesheetRow, key: TimesheetSortKey): string | number | null {
  switch (key) {
    case 'employee':
      return `${row.employeeDisplayName} ${row.employeeCode}`;
    case 'department':
      return row.departmentName;
    case 'date':
      return row.workDate;
    case 'show':
      return `${row.showCode} ${row.showName}`;
    case 'duration':
      return row.durationMinutes;
    case 'progress':
      return row.percentage;
  }
}

function compareValues(
  left: string | number | null,
  right: string | number | null,
  direction: 'asc' | 'desc',
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const sign = direction === 'asc' ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
  return String(left).localeCompare(String(right), undefined, { numeric: true }) * sign;
}

export interface TimesheetFilters {
  search: string;
  departments: readonly string[];
  showIds: readonly string[];
}

export const UNASSIGNED_DEPARTMENT = '~unassigned';

export function filterTimesheets(
  rows: readonly TeamTimesheetRow[],
  filters: TimesheetFilters,
): TeamTimesheetRow[] {
  const term = filters.search.trim().toLowerCase();
  const departments = new Set(filters.departments);
  const shows = new Set(filters.showIds);
  return rows.filter((row) => {
    if (departments.size && !departments.has(row.departmentName ?? UNASSIGNED_DEPARTMENT)) {
      return false;
    }
    if (shows.size && !shows.has(row.showId)) return false;
    if (!term) return true;
    return [
      row.employeeDisplayName,
      row.employeeCode,
      row.departmentName ?? '',
      row.showCode,
      row.showName,
      row.comment,
      row.workDate,
    ]
      .join(' ')
      .toLowerCase()
      .includes(term);
  });
}

export const timesheetGroupOptions = ['none', 'show', 'department', 'employee', 'date'] as const;
export type TimesheetGroupBy = (typeof timesheetGroupOptions)[number];
export const timesheetGroupLabels: Record<TimesheetGroupBy, string> = {
  none: 'No grouping',
  show: 'Show',
  department: 'Department',
  employee: 'Employee',
  date: 'Work date',
};

export interface TimesheetGroup {
  key: string;
  label: string;
  secondary?: string;
  order: string | number;
}

export function timesheetGroupFor(
  row: TeamTimesheetRow,
  groupBy: TimesheetGroupBy,
): TimesheetGroup {
  switch (groupBy) {
    case 'none':
      return { key: 'all', label: 'All', order: 0 };
    case 'show':
      return {
        key: row.showId,
        label: row.showCode,
        secondary: row.showName,
        order: `0:${row.showCode.toLowerCase()}`,
      };
    case 'department':
      return row.departmentName
        ? {
            key: row.departmentName,
            label: row.departmentName,
            order: `0:${row.departmentName.toLowerCase()}`,
          }
        : { key: UNASSIGNED_DEPARTMENT, label: 'Unassigned department', order: '1:' };
    case 'employee':
      return {
        key: row.employeeId,
        label: row.employeeDisplayName,
        secondary: [row.employeeCode, row.departmentName].filter(Boolean).join(' · '),
        order: `0:${row.employeeDisplayName.toLowerCase()}`,
      };
    case 'date':
      return {
        key: row.workDate,
        label: formatDay(row.workDate),
        order: -Number(row.workDate.replaceAll('-', '')),
      };
  }
}

export function orderTimesheets(
  rows: readonly TeamTimesheetRow[],
  rules: readonly TimesheetSortRule[],
  groupBy: TimesheetGroupBy,
): TeamTimesheetRow[] {
  return [...rows].sort((left, right) => {
    if (groupBy !== 'none') {
      const a = timesheetGroupFor(left, groupBy).order;
      const b = timesheetGroupFor(right, groupBy).order;
      const byGroup =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a).localeCompare(String(b), undefined, { numeric: true });
      if (byGroup) return byGroup;
    }
    for (const rule of rules) {
      const result = compareValues(
        sortValue(left, rule.key),
        sortValue(right, rule.key),
        rule.direction,
      );
      if (result) return result;
    }
    return left.id.localeCompare(right.id);
  });
}

export function summarizeTimesheets(rows: readonly TeamTimesheetRow[]) {
  const minutes = rows.reduce((total, row) => total + row.durationMinutes, 0);
  return {
    minutes,
    entries: rows.length,
    people: new Set(rows.map((row) => row.employeeId)).size,
    shows: new Set(rows.map((row) => row.showId)).size,
    days: new Set(rows.map((row) => row.workDate)).size,
    // Progress weighted by time spent, so a 10-minute entry does not count like a full day.
    averageProgress: minutes
      ? Math.round(
          rows.reduce((total, row) => total + row.percentage * row.durationMinutes, 0) / minutes,
        )
      : 0,
  };
}

/** CSV of the rows in display order, with the group first when grouped. */
export const timesheetColumnIds = [
  'employee',
  'department',
  'date',
  'show',
  'duration',
  'progress',
  'comment',
] as const;
export type TimesheetColumnId = (typeof timesheetColumnIds)[number];

const timesheetExportFields: Record<
  TimesheetColumnId,
  ReadonlyArray<{ header: string; value: (row: TeamTimesheetRow) => CsvValue }>
> = {
  employee: [
    { header: 'Employee', value: (row) => row.employeeDisplayName },
    { header: 'Employee code', value: (row) => row.employeeCode },
  ],
  department: [{ header: 'Department', value: (row) => row.departmentName ?? 'Unassigned' }],
  date: [{ header: 'Work date', value: (row) => row.workDate }],
  show: [
    { header: 'Show code', value: (row) => row.showCode },
    { header: 'Show name', value: (row) => row.showName },
  ],
  duration: [
    { header: 'Duration (minutes)', value: (row) => row.durationMinutes },
    { header: 'Duration', value: (row) => formatHours(row.durationMinutes) },
  ],
  progress: [{ header: 'Progress %', value: (row) => row.percentage }],
  comment: [{ header: 'Comment', value: (row) => row.comment }],
};

/** CSV export; columns follow `columnOrder`, the order shown in the grid. */
export function buildTimesheetExport(
  rows: readonly TeamTimesheetRow[],
  groupBy: TimesheetGroupBy,
  columnOrder: readonly TimesheetColumnId[] = timesheetColumnIds,
): { headers: string[]; rows: CsvValue[][] } {
  const grouped = groupBy !== 'none';
  const fields = columnOrder.flatMap((id) => timesheetExportFields[id]);
  return {
    headers: [
      ...(grouped ? [timesheetGroupLabels[groupBy]] : []),
      ...fields.map((field) => field.header),
    ],
    rows: rows.map((row) => [
      ...(grouped ? [timesheetGroupFor(row, groupBy).label] : []),
      ...fields.map((field) => field.value(row)),
    ]),
  };
}
