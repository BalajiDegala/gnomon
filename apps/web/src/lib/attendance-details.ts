import type { AttendanceDetailsDto, AttendanceDetailsRow } from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

interface AttendanceDetailsResponse {
  attendance: AttendanceDetailsDto;
}

interface IntervalSummary<Status extends string> {
  status: Status;
  firstAt: string | null;
  lastAt: string | null;
  workedMinutes: number;
  eventCount: number;
}

interface IntervalStatuses<Status extends string> {
  none: Status;
  complete: Status;
  missingFirst: Status;
  missingLast: Status;
  invalid: Status;
}

const BIOMETRIC_STATUSES: IntervalStatuses<AttendanceDetailsRow['biometric']['status']> = {
  none: 'none',
  complete: 'complete',
  missingFirst: 'missing_in',
  missingLast: 'missing_out',
  invalid: 'invalid',
};
const ACCESS_CARD_STATUSES: IntervalStatuses<AttendanceDetailsRow['accessCard']['status']> = {
  none: 'none',
  complete: 'complete',
  missingFirst: 'missing_entry',
  missingLast: 'missing_exit',
  invalid: 'invalid',
};
const ATTENDANCE_STATUS_PRIORITY: AttendanceDetailsRow['status'][] = [
  'present',
  'leave',
  'holiday',
  'weekend',
  'pending_regularisation',
  'partial',
  'absent',
];

function attendanceIdentityKey(row: AttendanceDetailsRow): string {
  const code = row.employeeCode.trim().toUpperCase();
  const directoryMatch = /^DDIH(\d+)$/i.exec(code);
  const personnelCode = directoryMatch?.[1] ?? (/^\d+$/.test(code) ? code : null);
  if (personnelCode) return `personnel:${String(Number(personnelCode))}`;
  return `employee:${row.employeeId}`;
}

function orderedInstants(values: Array<string | null>): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
}

function mergeInterval<Status extends string>(
  left: IntervalSummary<Status>,
  right: IntervalSummary<Status>,
  statuses: IntervalStatuses<Status>,
): IntervalSummary<Status> {
  const firstAt = orderedInstants([left.firstAt, right.firstAt])[0] ?? null;
  const lastAt = orderedInstants([left.lastAt, right.lastAt]).at(-1) ?? null;
  const eventCount = Math.max(left.eventCount, right.eventCount);
  let status = statuses.none;
  if (eventCount > 0 && !firstAt) status = statuses.missingFirst;
  else if (eventCount > 0 && !lastAt) status = statuses.missingLast;
  else if (firstAt && lastAt && lastAt <= firstAt) status = statuses.invalid;
  else if (eventCount > 0) status = statuses.complete;
  return {
    status,
    firstAt,
    lastAt,
    workedMinutes: Math.max(left.workedMinutes, right.workedMinutes),
    eventCount,
  };
}

function bestRow(
  rows: AttendanceDetailsRow[],
  score: (row: AttendanceDetailsRow) => number,
): AttendanceDetailsRow {
  return rows.reduce((best, row) => (score(row) > score(best) ? row : best));
}

function canonicalRow(rows: AttendanceDetailsRow[]): AttendanceDetailsRow {
  return [...rows].sort((left, right) => {
    const leftIsDirectory = /^DDIH\d+$/i.test(left.employeeCode) ? 1 : 0;
    const rightIsDirectory = /^DDIH\d+$/i.test(right.employeeCode) ? 1 : 0;
    return (
      rightIsDirectory - leftIsDirectory ||
      left.employeeDisplayName.length - right.employeeDisplayName.length
    );
  })[0]!;
}

function resolvedAnomalies(
  rows: AttendanceDetailsRow[],
  biometric: AttendanceDetailsRow['biometric'],
  accessCard: AttendanceDetailsRow['accessCard'],
  website: AttendanceDetailsRow['website'],
): string[] {
  const anomalies = new Set(rows.flatMap((row) => row.anomalies));
  const resolved = [
    [biometric.status === 'complete', ['missing_biometric_in', 'missing_biometric_out']],
    [accessCard.status === 'complete', ['missing_access_entry', 'missing_access_exit']],
    [website.status === 'complete', ['missing_web_start', 'missing_web_stop']],
  ] as const;
  for (const [isResolved, values] of resolved) {
    if (isResolved) values.forEach((value) => anomalies.delete(value));
  }
  return [...anomalies];
}

function mergedAttendanceStatus(rows: AttendanceDetailsRow[]): AttendanceDetailsRow['status'] {
  return (
    ATTENDANCE_STATUS_PRIORITY.find((status) => rows.some((row) => row.status === status)) ??
    'absent'
  );
}

function mergeRows(rows: AttendanceDetailsRow[]): AttendanceDetailsRow {
  const canonical = canonicalRow(rows);
  const biometric = rows
    .slice(1)
    .reduce(
      (current, row) => mergeInterval(current, row.biometric, BIOMETRIC_STATUSES),
      rows[0]!.biometric,
    );
  const accessCard = rows
    .slice(1)
    .reduce(
      (current, row) => mergeInterval(current, row.accessCard, ACCESS_CARD_STATUSES),
      rows[0]!.accessCard,
    );
  const website = bestRow(
    rows,
    (row) => row.website.sessionCount * 100_000 + row.website.workedMinutes,
  ).website;
  const timesheets = bestRow(
    rows,
    (row) => row.timesheets.entryCount * 100_000 + row.timesheets.totalMinutes,
  ).timesheets;
  const anomalies = resolvedAnomalies(rows, biometric, accessCard, website);

  return {
    ...canonical,
    id: canonical.id,
    status: mergedAttendanceStatus(rows),
    requiresReview: anomalies.length > 0,
    biometric,
    accessCard,
    website,
    timesheets,
    payableMinutes: Math.max(...rows.map((row) => row.payableMinutes)),
    anomalies,
  };
}

export function mergeAttendanceRows(rows: readonly AttendanceDetailsRow[]): AttendanceDetailsRow[] {
  const grouped = new Map<string, AttendanceDetailsRow[]>();
  for (const row of rows) {
    const key = `${attendanceIdentityKey(row)}:${row.workDate}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return [...grouped.values()].map(mergeRows);
}

export function useAttendanceDetails(month: string) {
  const { request, user } = useAuth();
  const canRead =
    user?.permissions.some((permission) =>
      ['attendance:all:read', 'attendance:team:read', 'audit:read'].includes(permission),
    ) ?? false;
  const query = useQuery({
    queryKey: ['attendance-details', month || 'latest'],
    queryFn: () =>
      request<AttendanceDetailsResponse>(
        `/api/v1/reports/attendance-details${month ? `?month=${encodeURIComponent(month)}` : ''}`,
      ),
    enabled: canRead,
  });
  return {
    canRead,
    attendance: query.data?.attendance,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
