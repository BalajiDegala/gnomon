import type { AttendanceDetailsDto, AttendanceDetailsRow } from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

interface AttendanceDetailsResponse {
  attendance: AttendanceDetailsDto;
}

function attendanceIdentityKey(row: AttendanceDetailsRow): string {
  const code = row.employeeCode.trim().toUpperCase();
  const personnelMatch = code.match(/^DDIH0*(\d+)$/) ?? code.match(/^0*(\d+)$/);
  if (personnelMatch) return `personnel:${String(Number(personnelMatch[1]))}`;
  return `employee:${row.employeeId}`;
}

function firstInstant(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

function lastInstant(values: Array<string | null>): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function mergeEvidence(
  left: AttendanceDetailsRow['biometric'],
  right: AttendanceDetailsRow['biometric'],
): AttendanceDetailsRow['biometric'] {
  const firstAt = firstInstant([left.firstAt, right.firstAt]);
  const lastAt = lastInstant([left.lastAt, right.lastAt]);
  const eventCount = Math.max(left.eventCount, right.eventCount);
  const status: AttendanceDetailsRow['biometric']['status'] =
    eventCount === 0
      ? 'none'
      : firstAt && lastAt
        ? 'complete'
        : !firstAt
          ? 'missing_in'
          : !lastAt
            ? 'missing_out'
            : 'invalid';
  return {
    status,
    firstAt,
    lastAt,
    workedMinutes: Math.max(left.workedMinutes, right.workedMinutes),
    eventCount,
  };
}

function mergeAccessCardEvidence(
  left: AttendanceDetailsRow['accessCard'],
  right: AttendanceDetailsRow['accessCard'],
): AttendanceDetailsRow['accessCard'] {
  const firstAt = firstInstant([left.firstAt, right.firstAt]);
  const lastAt = lastInstant([left.lastAt, right.lastAt]);
  const eventCount = Math.max(left.eventCount, right.eventCount);
  const status: AttendanceDetailsRow['accessCard']['status'] =
    eventCount === 0
      ? 'none'
      : firstAt && lastAt
        ? 'complete'
        : !firstAt
          ? 'missing_entry'
          : !lastAt
            ? 'missing_exit'
            : 'invalid';
  return {
    status,
    firstAt,
    lastAt,
    workedMinutes: Math.max(left.workedMinutes, right.workedMinutes),
    eventCount,
  };
}

function mergeRows(rows: AttendanceDetailsRow[]): AttendanceDetailsRow {
  const canonical = [...rows].sort((left, right) => {
    const leftIsDirectory = /^DDIH\d+$/i.test(left.employeeCode) ? 1 : 0;
    const rightIsDirectory = /^DDIH\d+$/i.test(right.employeeCode) ? 1 : 0;
    return (
      rightIsDirectory - leftIsDirectory ||
      left.employeeDisplayName.length - right.employeeDisplayName.length
    );
  })[0]!;
  const biometric = rows
    .slice(1)
    .reduce((current, row) => mergeEvidence(current, row.biometric), rows[0]!.biometric);
  const accessCard = rows
    .slice(1)
    .reduce(
      (current, row) => mergeAccessCardEvidence(current, row.accessCard),
      rows[0]!.accessCard,
    );
  const website = [...rows].sort(
    (left, right) =>
      right.website.sessionCount - left.website.sessionCount ||
      right.website.workedMinutes - left.website.workedMinutes,
  )[0]!.website;
  const timesheets = [...rows].sort(
    (left, right) =>
      right.timesheets.entryCount - left.timesheets.entryCount ||
      right.timesheets.totalMinutes - left.timesheets.totalMinutes,
  )[0]!.timesheets;
  const anomalies = new Set(rows.flatMap((row) => row.anomalies));
  if (biometric.status === 'complete') {
    anomalies.delete('missing_biometric_in');
    anomalies.delete('missing_biometric_out');
  }
  if (accessCard.status === 'complete') {
    anomalies.delete('missing_access_entry');
    anomalies.delete('missing_access_exit');
  }
  if (website.status === 'complete') {
    anomalies.delete('missing_web_start');
    anomalies.delete('missing_web_stop');
  }

  const status = rows.some((row) => row.status === 'present')
    ? 'present'
    : rows.some((row) => row.status === 'leave')
      ? 'leave'
      : rows.some((row) => row.status === 'holiday')
        ? 'holiday'
        : rows.some((row) => row.status === 'weekend')
          ? 'weekend'
          : rows.some((row) => row.status === 'pending_regularisation')
            ? 'pending_regularisation'
            : rows.some((row) => row.status === 'partial')
              ? 'partial'
              : 'absent';

  return {
    ...canonical,
    id: canonical.id,
    status,
    requiresReview: anomalies.size > 0,
    biometric,
    accessCard,
    website,
    timesheets,
    payableMinutes: Math.max(...rows.map((row) => row.payableMinutes)),
    anomalies: [...anomalies],
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
