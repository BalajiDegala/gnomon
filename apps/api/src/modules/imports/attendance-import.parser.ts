import type { AttendanceImportErrorDto, AttendanceImportSource } from '@gnomon/shared';
import { parse } from 'csv-parse/sync';

import type { AttendanceEventType } from '../attendance/attendance-event.model.js';

const REQUIRED_COLUMNS = ['employee_code', 'occurred_at', 'event_type'] as const;
const MAX_ROWS = 20_000;
const INDIA_OFFSET_MINUTES = 330;

export interface ParsedAttendanceRow {
  rowNumber: number;
  employeeCode: string;
  occurredAt: Date;
  workDate?: string;
  eventType: AttendanceEventType;
  sourceEventId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  rawPayload: Record<string, string>;
}

function parseBiometricSummaryTime(workDate: string, value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return parseAttendanceTimestamp(
    `${workDate} ${String(Number(match[1])).padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}`,
  );
}

function nextCalendarDate(workDate: string): string {
  return new Date(new Date(`${workDate}T00:00:00.000Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function isValidWorkDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseBiometricSummaryRows(records: Record<string, string>[]): ParsedAttendanceCsv {
  const rows: ParsedAttendanceRow[] = [];
  const errors: AttendanceImportErrorDto[] = [];
  let ignoredRows = 0;
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const employeeCode = (record.employee_code ?? '').trim().toUpperCase().slice(0, 100);
    const workDate = (record.date ?? '').trim();
    const inValue = (record.in_time ?? '').trim();
    const outValue = (record.out_time ?? '').trim();
    if (!inValue && !outValue) {
      ignoredRows += 1;
      return;
    }
    if (!employeeCode) {
      errors.push({ rowNumber, employeeCode: '', reason: 'Employee Code is required' });
      return;
    }
    if (!isValidWorkDate(workDate)) {
      errors.push({ rowNumber, employeeCode, reason: 'Date must use YYYY-MM-DD' });
      return;
    }
    const rawPayload = Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, String(value).slice(0, 2_000)]),
    );
    const inAt = inValue ? parseBiometricSummaryTime(workDate, inValue) : null;
    if (inValue && !inAt) {
      errors.push({ rowNumber, employeeCode, reason: 'In Time is invalid' });
    } else if (inAt) {
      rows.push({
        rowNumber,
        employeeCode,
        occurredAt: inAt,
        workDate,
        eventType: 'in',
        sourceEventId: `${employeeCode}:${workDate}:in`,
        deviceId: null,
        deviceName: 'Biometric attendance report',
        rawPayload,
      });
    }
    if (outValue) {
      let outAt = parseBiometricSummaryTime(workDate, outValue);
      if (outAt && inAt && outAt <= inAt) {
        outAt = parseBiometricSummaryTime(nextCalendarDate(workDate), outValue);
      }
      if (!outAt) {
        errors.push({ rowNumber, employeeCode, reason: 'Out Time is invalid' });
      } else {
        rows.push({
          rowNumber,
          employeeCode,
          occurredAt: outAt,
          workDate,
          eventType: 'out',
          sourceEventId: `${employeeCode}:${workDate}:out`,
          deviceId: null,
          deviceName: 'Biometric attendance report',
          rawPayload,
        });
      }
    }
  });
  if (records.length === 0) {
    errors.push({ rowNumber: 1, employeeCode: '', reason: 'CSV contains no attendance rows' });
  }
  return {
    totalRows: records.length,
    ignoredRows,
    rows,
    errors,
    employeeProfiles: [],
  };
}

export interface ParsedEmployeeProfile {
  employeeCode: string;
  firstName: string;
  lastName: string;
  departmentName: string | null;
  cardNumber: string | null;
  lastSeenAt: Date;
}

export interface ParsedAttendanceFile {
  totalRows: number;
  ignoredRows: number;
  rows: ParsedAttendanceRow[];
  errors: AttendanceImportErrorDto[];
  employeeProfiles: ParsedEmployeeProfile[];
}

export type ParsedAttendanceCsv = ParsedAttendanceFile;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function valueOrNull(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 255) : null;
}

function isValidLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day &&
    candidate.getUTCHours() === hour &&
    candidate.getUTCMinutes() === minute &&
    candidate.getUTCSeconds() === second
  );
}

function indiaLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date | null {
  if (!isValidLocalDate(year, month, day, hour, minute, second)) return null;
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - INDIA_OFFSET_MINUTES * 60_000,
  );
}

/** Parse an explicit ISO instant or a common biometric timestamp interpreted as Asia/Kolkata. */
export function parseAttendanceTimestamp(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    const instant = new Date(normalized);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const yearFirst = normalized.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (yearFirst) {
    return indiaLocalDate(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3]),
      Number(yearFirst[4]),
      Number(yearFirst[5]),
      Number(yearFirst[6] ?? 0),
    );
  }

  const dayFirst = normalized.match(
    /^(\d{2})[-/](\d{2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (dayFirst) {
    return indiaLocalDate(
      Number(dayFirst[3]),
      Number(dayFirst[2]),
      Number(dayFirst[1]),
      Number(dayFirst[4]),
      Number(dayFirst[5]),
      Number(dayFirst[6] ?? 0),
    );
  }

  return null;
}

export function normalizeEventType(
  source: AttendanceImportSource,
  value: string,
): AttendanceEventType | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (source === 'biometric') {
    if (['in', 'punch_in', 'check_in', 'signin'].includes(normalized)) return 'in';
    if (['out', 'punch_out', 'check_out', 'signout'].includes(normalized)) return 'out';
    return null;
  }

  if (['entry', 'in', 'card_in', 'access_in'].includes(normalized)) return 'entry';
  if (['exit', 'out', 'card_out', 'access_out'].includes(normalized)) return 'exit';
  return null;
}

export function parseAttendanceCsv(
  csvText: string,
  source: AttendanceImportSource,
): ParsedAttendanceCsv {
  let headers: string[] = [];
  let records: Record<string, string>[];

  try {
    records = parse(csvText, {
      bom: true,
      columns: (values: string[]) => {
        headers = values.map(normalizeHeader);
        return headers;
      },
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (error) {
    return {
      totalRows: 0,
      ignoredRows: 0,
      rows: [],
      employeeProfiles: [],
      errors: [
        {
          rowNumber: 1,
          employeeCode: '',
          reason: `CSV could not be parsed: ${error instanceof Error ? error.message : 'invalid format'}`,
        },
      ],
    };
  }

  const biometricSummary =
    source === 'biometric' &&
    ['date', 'employee_code', 'in_time', 'out_time'].every((column) => headers.includes(column));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (!biometricSummary && missingColumns.length > 0) {
    return {
      totalRows: records.length,
      ignoredRows: 0,
      rows: [],
      employeeProfiles: [],
      errors: [
        {
          rowNumber: 1,
          employeeCode: '',
          reason: `Missing required column${missingColumns.length === 1 ? '' : 's'}: ${missingColumns.join(', ')}`,
        },
      ],
    };
  }

  if (new Set(headers).size !== headers.length) {
    return {
      totalRows: records.length,
      ignoredRows: 0,
      rows: [],
      employeeProfiles: [],
      errors: [{ rowNumber: 1, employeeCode: '', reason: 'CSV contains duplicate columns' }],
    };
  }

  if (records.length > MAX_ROWS) {
    return {
      totalRows: records.length,
      ignoredRows: 0,
      rows: [],
      employeeProfiles: [],
      errors: [
        {
          rowNumber: 1,
          employeeCode: '',
          reason: `CSV exceeds the ${MAX_ROWS.toLocaleString('en-IN')} row limit`,
        },
      ],
    };
  }

  if (biometricSummary) return parseBiometricSummaryRows(records);

  const rows: ParsedAttendanceRow[] = [];
  const errors: AttendanceImportErrorDto[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const employeeCode = (record.employee_code ?? '').trim().toUpperCase().slice(0, 100);
    const occurredAt = parseAttendanceTimestamp(record.occurred_at ?? '');
    const eventType = normalizeEventType(source, record.event_type ?? '');

    if (!employeeCode) {
      errors.push({ rowNumber, employeeCode: '', reason: 'Employee code is required' });
      return;
    }
    if (!occurredAt) {
      errors.push({
        rowNumber,
        employeeCode,
        reason: 'Timestamp is invalid; use ISO 8601 or DD/MM/YYYY HH:mm:ss',
      });
      return;
    }
    if (!eventType) {
      errors.push({
        rowNumber,
        employeeCode,
        reason:
          source === 'biometric'
            ? 'Biometric event type must be in or out'
            : 'Access-card event type must be entry or exit',
      });
      return;
    }

    rows.push({
      rowNumber,
      employeeCode,
      occurredAt,
      eventType,
      sourceEventId: valueOrNull(record.source_event_id),
      deviceId: valueOrNull(record.device_id),
      deviceName: valueOrNull(record.device_name),
      rawPayload: Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, String(value).slice(0, 2_000)]),
      ),
    });
  });

  if (records.length === 0) {
    errors.push({ rowNumber: 1, employeeCode: '', reason: 'CSV contains no attendance rows' });
  }

  return { totalRows: records.length, ignoredRows: 0, rows, errors, employeeProfiles: [] };
}
