import { attendanceStatusLabels, type AttendanceDetailsRow } from '@gnomon/shared';

import type { CsvValue } from './csv';

/* ------------------------------------------------------------------ types */

export const attendanceSortKeys = [
  'employee',
  'department',
  'date',
  'shift',
  'workMode',
  'biometricIn',
  'biometricOut',
  'biometricDuration',
  'accessEntry',
  'accessExit',
  'accessDuration',
  'website',
  'timesheets',
  'payable',
  'status',
] as const;
export type AttendanceSortKey = (typeof attendanceSortKeys)[number];

export const attendanceColumnIds = [
  'employee',
  'department',
  'date',
  'shift',
  'workMode',
  'biometricIn',
  'biometricOut',
  'biometricSummary',
  'accessEntry',
  'accessExit',
  'accessSummary',
  'website',
  'timesheets',
  'payable',
  'status',
] as const;
export type AttendanceColumnId = (typeof attendanceColumnIds)[number];

export const attendanceGroupOptions = [
  'none',
  'employee',
  'department',
  'date',
  'status',
  'workMode',
  'shift',
] as const;
export type AttendanceGroupBy = (typeof attendanceGroupOptions)[number];

export const attendanceSourceFilters = [
  'all',
  'biometric',
  'accessCard',
  'website',
  'timesheets',
  'noEvidence',
] as const;
export type AttendanceSourceFilter = (typeof attendanceSourceFilters)[number];

export const workModeFilters = ['all', 'office', 'home', 'undeclared'] as const;
export type WorkModeFilter = (typeof workModeFilters)[number];

export type AttendanceStatus = AttendanceDetailsRow['status'];
export const attendanceStatusOrder: readonly AttendanceStatus[] = [
  'absent',
  'partial',
  'present',
  'pending_regularisation',
  'leave',
  'holiday',
  'weekend',
];
export const attendanceStatusFilters = ['all', ...attendanceStatusOrder] as const;
export type AttendanceStatusFilter = (typeof attendanceStatusFilters)[number];

export interface SortRule {
  key: AttendanceSortKey;
  direction: 'asc' | 'desc';
}

export interface AttendanceFilters {
  search: string;
  status: AttendanceStatusFilter;
  workMode: WorkModeFilter;
  source: AttendanceSourceFilter;
}

/* ------------------------------------------------------------ formatting */

export function formatMinutes(minutes: number): string {
  if (!minutes) return '0h 00m';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function formatWorkDate(workDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${workDate}T00:00:00.000Z`));
}

export function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Work modes used on the day, in order; older rows only have the single mode. */
export function dayWorkModes(row: AttendanceDetailsRow): Array<'office' | 'home'> {
  if (row.workContext.workModes?.length) return row.workContext.workModes;
  return row.workContext.workMode ? [row.workContext.workMode] : [];
}

/** "WFO", "WFH" or "WFO → WFH" for a day that moved from office to home. */
export function workModeShortLabel(row: AttendanceDetailsRow): string {
  return dayWorkModes(row)
    .map((mode) => (mode === 'home' ? 'WFH' : 'WFO'))
    .join(' → ');
}

/* ---------------------------------------------------------------- sorting */

export const defaultSort: readonly SortRule[] = [{ key: 'date', direction: 'desc' }];

/** Default direction when a column is first sorted: newest dates and largest totals first. */
export function initialDirection(key: AttendanceSortKey): 'asc' | 'desc' {
  return [
    'date',
    'biometricDuration',
    'accessDuration',
    'website',
    'timesheets',
    'payable',
  ].includes(key)
    ? 'desc'
    : 'asc';
}

export function serializeSort(rules: readonly SortRule[]): string {
  return rules.map((rule) => `${rule.key}:${rule.direction}`).join(',');
}

export function parseSort(value: string): SortRule[] | null {
  const rules: SortRule[] = [];
  for (const part of value.split(',')) {
    const [key, direction] = part.split(':');
    if (!attendanceSortKeys.includes(key as AttendanceSortKey)) return null;
    if (direction !== 'asc' && direction !== 'desc') return null;
    if (rules.some((rule) => rule.key === key)) return null;
    rules.push({ key: key as AttendanceSortKey, direction });
  }
  return rules.length > 0 && rules.length <= 3 ? rules : null;
}

/**
 * Click sorts by one column (clicking the only sorted column flips it).
 * Shift+click adds the column as another level, or flips it if present.
 */
export function nextSort(
  rules: readonly SortRule[],
  key: AttendanceSortKey,
  additive: boolean,
): SortRule[] {
  const existing = rules.find((rule) => rule.key === key);
  const flipped = (rule: SortRule): SortRule => ({
    ...rule,
    direction: rule.direction === 'asc' ? 'desc' : 'asc',
  });
  if (additive) {
    if (existing) return rules.map((rule) => (rule.key === key ? flipped(rule) : rule));
    return [...rules, { key, direction: initialDirection(key) }].slice(-3);
  }
  if (existing && rules.length === 1) return [flipped(existing)];
  return [{ key, direction: existing?.direction ?? initialDirection(key) }];
}

const statusRank = new Map(attendanceStatusOrder.map((status, index) => [status, index]));

export function sortValue(
  row: AttendanceDetailsRow,
  key: AttendanceSortKey,
): string | number | null {
  switch (key) {
    case 'employee':
      return `${row.employeeDisplayName} ${row.employeeCode}`;
    case 'department':
      return row.departmentName;
    case 'date':
      return row.workDate;
    case 'shift':
      return row.workContext.shiftName;
    case 'workMode':
      return workModeShortLabel(row) || null;
    case 'biometricIn':
      return row.biometric.firstAt;
    case 'biometricOut':
      return row.biometric.lastAt;
    case 'biometricDuration':
      return row.biometric.workedMinutes;
    case 'accessEntry':
      return row.accessCard.firstAt;
    case 'accessExit':
      return row.accessCard.lastAt;
    case 'accessDuration':
      return row.accessCard.workedMinutes;
    case 'website':
      return row.website.workedMinutes;
    case 'timesheets':
      return row.timesheets.totalMinutes;
    case 'payable':
      return row.payableMinutes;
    case 'status':
      return statusRank.get(row.status) ?? 99;
  }
}

/** Empty values always sort last, whichever the direction. */
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
  return (
    String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) *
    sign
  );
}

export function compareRows(
  left: AttendanceDetailsRow,
  right: AttendanceDetailsRow,
  rules: readonly SortRule[],
): number {
  for (const rule of rules) {
    const result = compareValues(
      sortValue(left, rule.key),
      sortValue(right, rule.key),
      rule.direction,
    );
    if (result) return result;
  }
  return (
    left.employeeDisplayName.localeCompare(right.employeeDisplayName) ||
    right.workDate.localeCompare(left.workDate)
  );
}

/* ---------------------------------------------------------------- filters */

function matchesSource(row: AttendanceDetailsRow, source: AttendanceSourceFilter): boolean {
  switch (source) {
    case 'all':
      return true;
    case 'biometric':
      return row.biometric.eventCount > 0;
    case 'accessCard':
      return row.accessCard.eventCount > 0;
    case 'website':
      return row.website.sessionCount > 0;
    case 'timesheets':
      return row.timesheets.entryCount > 0;
    case 'noEvidence':
      return (
        row.biometric.eventCount === 0 &&
        row.accessCard.eventCount === 0 &&
        row.website.sessionCount === 0
      );
  }
}

function matchesWorkMode(row: AttendanceDetailsRow, workMode: WorkModeFilter): boolean {
  if (workMode === 'all') return true;
  const modes = dayWorkModes(row);
  if (workMode === 'undeclared') return modes.length === 0;
  // A day that moved from office to home matches both filters.
  return modes.includes(workMode);
}

function matchesSearch(row: AttendanceDetailsRow, term: string): boolean {
  if (!term) return true;
  return [
    row.employeeCode,
    row.employeeDisplayName,
    row.departmentName ?? '',
    row.workDate,
    attendanceStatusLabels[row.status],
    row.workContext.shiftName ?? '',
    workModeShortLabel(row),
  ]
    .join(' ')
    .toLowerCase()
    .includes(term);
}

/** Applies every filter except status; status chips show counts over this set. */
export function filterRowsExceptStatus(
  rows: readonly AttendanceDetailsRow[],
  filters: Omit<AttendanceFilters, 'status'>,
): AttendanceDetailsRow[] {
  const term = filters.search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      matchesSource(row, filters.source) &&
      matchesWorkMode(row, filters.workMode) &&
      matchesSearch(row, term),
  );
}

export function countByStatus(
  rows: readonly AttendanceDetailsRow[],
): Record<AttendanceStatus, number> {
  const counts = Object.fromEntries(attendanceStatusOrder.map((status) => [status, 0])) as Record<
    AttendanceStatus,
    number
  >;
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/* --------------------------------------------------------------- grouping */

export const groupLabels: Record<AttendanceGroupBy, string> = {
  none: 'No grouping',
  employee: 'Employee',
  department: 'Department',
  date: 'Work date',
  status: 'Attendance status',
  workMode: 'Work mode',
  shift: 'Shift',
};

export interface RowGroup {
  key: string;
  label: string;
  secondary?: string;
  /** Sort position of the group itself. */
  order: string | number;
}

export function groupFor(row: AttendanceDetailsRow, groupBy: AttendanceGroupBy): RowGroup {
  switch (groupBy) {
    case 'none':
      return { key: 'all', label: 'All', order: 0 };
    case 'employee':
      return {
        key: row.employeeId,
        label: row.employeeDisplayName,
        secondary: [row.employeeCode, row.departmentName].filter(Boolean).join(' · '),
        order: `0:${row.employeeDisplayName.toLowerCase()}`,
      };
    case 'department':
      return row.departmentName
        ? {
            key: row.departmentName,
            label: row.departmentName,
            order: `0:${row.departmentName.toLowerCase()}`,
          }
        : { key: '~unassigned', label: 'Unassigned department', order: '1:' };
    case 'date':
      // Newest first: invert the ISO date so ascending order lists recent days first.
      return {
        key: row.workDate,
        label: formatWorkDate(row.workDate),
        order: -Number(row.workDate.replaceAll('-', '')),
      };
    case 'status':
      return {
        key: row.status,
        label: attendanceStatusLabels[row.status],
        order: statusRank.get(row.status) ?? 99,
      };
    case 'workMode': {
      const modes = dayWorkModes(row);
      if (modes.length > 1) {
        return { key: 'mixed', label: `Office and home (${workModeShortLabel(row)})`, order: 2 };
      }
      return modes[0] === 'home'
        ? { key: 'home', label: 'Work from home (WFH)', order: 1 }
        : modes[0] === 'office'
          ? { key: 'office', label: 'Work from office (WFO)', order: 0 }
          : { key: 'undeclared', label: 'Work mode not declared', order: 3 };
    }
    case 'shift':
      return row.workContext.shiftName
        ? {
            key: row.workContext.shiftName,
            label: row.workContext.shiftName,
            secondary:
              row.workContext.shiftStartTime && row.workContext.shiftEndTime
                ? `${row.workContext.shiftStartTime} – ${row.workContext.shiftEndTime}`
                : undefined,
            order: `0:${row.workContext.shiftName.toLowerCase()}`,
          }
        : { key: '~none', label: 'No shift recorded', order: '1:' };
  }
}

function compareGroupOrder(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

/** Sorts rows by the sort rules; when grouped, groups come first in their natural order. */
export function orderRows(
  rows: readonly AttendanceDetailsRow[],
  rules: readonly SortRule[],
  groupBy: AttendanceGroupBy,
): AttendanceDetailsRow[] {
  return [...rows].sort((left, right) => {
    if (groupBy !== 'none') {
      const leftGroup = groupFor(left, groupBy);
      const rightGroup = groupFor(right, groupBy);
      const byGroup = compareGroupOrder(leftGroup.order, rightGroup.order);
      if (byGroup) return byGroup;
    }
    return compareRows(left, right, rules);
  });
}

/* ----------------------------------------------------------------- export */

type ExportCell = readonly [header: string, value: (row: AttendanceDetailsRow) => CsvValue];

const exportCells: Record<AttendanceColumnId, readonly ExportCell[]> = {
  employee: [
    ['Employee', (row) => row.employeeDisplayName],
    ['Employee code', (row) => row.employeeCode],
  ],
  department: [['Department', (row) => row.departmentName ?? 'Unassigned']],
  date: [['Work date', (row) => row.workDate]],
  shift: [
    ['Shift', (row) => row.workContext.shiftName ?? ''],
    [
      'Shift hours',
      (row) =>
        row.workContext.shiftStartTime && row.workContext.shiftEndTime
          ? `${row.workContext.shiftStartTime}-${row.workContext.shiftEndTime}`
          : '',
    ],
  ],
  workMode: [['Work mode', workModeShortLabel]],
  biometricIn: [
    ['Biometric entry', (row) => (row.biometric.firstAt ? formatTime(row.biometric.firstAt) : '')],
  ],
  biometricOut: [
    ['Biometric exit', (row) => (row.biometric.lastAt ? formatTime(row.biometric.lastAt) : '')],
  ],
  biometricSummary: [
    ['Biometric duration', (row) => formatMinutes(row.biometric.workedMinutes)],
    ['Biometric punches', (row) => row.biometric.eventCount],
    ['Biometric status', (row) => humanize(row.biometric.status)],
  ],
  accessEntry: [
    [
      'Access-card entry',
      (row) => (row.accessCard.firstAt ? formatTime(row.accessCard.firstAt) : ''),
    ],
  ],
  accessExit: [
    ['Access-card exit', (row) => (row.accessCard.lastAt ? formatTime(row.accessCard.lastAt) : '')],
  ],
  accessSummary: [
    ['Access-card duration', (row) => formatMinutes(row.accessCard.workedMinutes)],
    ['Access-card events', (row) => row.accessCard.eventCount],
    ['Access-card status', (row) => humanize(row.accessCard.status)],
  ],
  website: [
    ['Website time', (row) => formatMinutes(row.website.workedMinutes)],
    ['Website sessions', (row) => row.website.sessionCount],
    ['Website status', (row) => humanize(row.website.status)],
  ],
  timesheets: [
    ['Show time', (row) => formatMinutes(row.timesheets.totalMinutes)],
    ['Show entries', (row) => row.timesheets.entryCount],
    ['Show progress %', (row) => row.timesheets.averageProgress],
  ],
  payable: [['Payable time', (row) => formatMinutes(row.payableMinutes)]],
  status: [
    ['Attendance', (row) => attendanceStatusLabels[row.status]],
    ['Review required', (row) => (row.requiresReview ? 'Yes' : 'No')],
    ['Anomalies', (row) => row.anomalies.map(humanize).join('; ')],
  ],
};

/**
 * Builds the CSV for exactly what the grid shows: the given rows in display
 * order, the visible columns in column order, and the group when grouped.
 */
export function buildAttendanceExport(
  rows: readonly AttendanceDetailsRow[],
  columnIds: readonly AttendanceColumnId[],
  groupBy: AttendanceGroupBy,
): { headers: string[]; rows: CsvValue[][] } {
  const cells = columnIds.flatMap((columnId) => exportCells[columnId]);
  const grouped = groupBy !== 'none';
  return {
    headers: [...(grouped ? [groupLabels[groupBy]] : []), ...cells.map(([header]) => header)],
    rows: rows.map((row) => [
      ...(grouped ? [groupFor(row, groupBy).label] : []),
      ...cells.map(([, value]) => value(row)),
    ]),
  };
}
