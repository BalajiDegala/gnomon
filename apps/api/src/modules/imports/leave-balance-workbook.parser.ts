import type { LeaveBalanceImportFormat, LeaveBalanceImportIssue, LeaveType } from '@gnomon/shared';

import { readFirstWorksheetRows, WorkbookReadError, type WorkbookRow } from './xlsx-rows.reader.js';

const MAX_ROWS = 20_000;
const HEADER_SCAN_ROWS = 30;

export type ImportedLeaveType = Exclude<LeaveType, 'unpaid'>;

export interface ParsedLeaveBalanceEntry {
  rowNumber: number;
  employeeCode: string;
  leaveType: ImportedLeaveType;
  /** Balance still available as of the report; may be negative. */
  days: number;
}

export interface ParsedLeaveBalanceFile {
  format: LeaveBalanceImportFormat | null;
  /** Year the report belongs to, when the file says so. */
  year: number | null;
  asOfLabel: string | null;
  totalRows: number;
  entries: ParsedLeaveBalanceEntry[];
  ignoredLeaveTypes: Record<string, number>;
  errors: LeaveBalanceImportIssue[];
}

/** HRMS leave type names mapped onto the app's leave types. */
const PERMANENT_LEAVE_TYPES: Record<string, ImportedLeaveType> = {
  'casual or sick leave': 'casual',
  'casual leave': 'casual',
  'sick leave': 'casual',
  'privilege leave': 'earned',
  'earned leave': 'earned',
  'compensatory off': 'comp_off',
  'comp off': 'comp_off',
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findColumn(headers: Map<number, string>, ...prefixes: string[]): number | null {
  for (const prefix of prefixes) {
    for (const [column, header] of headers) {
      if (header === prefix || header.startsWith(`${prefix}_`)) return column;
    }
  }
  return null;
}

function parseDays(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const days = Number(value.trim());
  return Number.isFinite(days) ? Math.round(days * 100) / 100 : Number.NaN;
}

function yearFromText(text: string): number | null {
  const fullYear = /\b(20\d{2})\b/.exec(text)?.[1];
  if (fullYear) return Number(fullYear);
  const shortYear = /[''’](\d{2})\b/.exec(text)?.[1];
  return shortYear ? 2000 + Number(shortYear) : null;
}

function emptyResult(reason: string, totalRows = 0): ParsedLeaveBalanceFile {
  return {
    format: null,
    year: null,
    asOfLabel: null,
    totalRows,
    entries: [],
    ignoredLeaveTypes: {},
    errors: [{ rowNumber: 1, employeeCode: '', reason }],
  };
}

interface Layout {
  format: LeaveBalanceImportFormat;
  headerIndex: number;
  codeColumn: number;
  typeColumn: number | null;
  balanceColumn: number;
  fallbackColumn: number | null;
}

function detectLayout(rows: WorkbookRow[]): Layout | null {
  for (let index = 0; index < Math.min(rows.length, HEADER_SCAN_ROWS); index += 1) {
    const headers = new Map(
      [...rows[index]!.cells].map(([column, value]) => [column, normalizeHeader(value)]),
    );
    const employeeColumn = findColumn(headers, 'employee_id', 'emp_id');
    const typeColumn = findColumn(headers, 'leave_type');
    const availableColumn = findColumn(headers, 'leaves_available', 'leave_available');
    if (employeeColumn && typeColumn && availableColumn) {
      return {
        format: 'permanent',
        headerIndex: index,
        codeColumn: employeeColumn,
        typeColumn,
        balanceColumn: availableColumn,
        fallbackColumn: null,
      };
    }
    const consultantColumn = findColumn(headers, 'consultant_id', 'employee_id', 'emp_id');
    const closingColumn = findColumn(headers, 'closing_balance_leaves', 'closing_balance');
    if (consultantColumn && closingColumn) {
      return {
        format: 'contract',
        headerIndex: index,
        codeColumn: consultantColumn,
        typeColumn: null,
        balanceColumn: closingColumn,
        fallbackColumn: findColumn(headers, 'opening_balance_leave', 'opening_balance'),
      };
    }
  }
  return null;
}

/**
 * Parse either HRMS leave balance export:
 * - permanent: "LeavesSummaryReport" with one row per employee and leave type
 *   (Employee ID, Leave Type, ..., Leaves Available);
 * - contract: consultants sheet with one row per person
 *   (Consultant Id, ..., Closing Balance Leaves), imported as casual/sick leave.
 */
export function parseLeaveBalanceWorkbook(workbookBuffer: Buffer): ParsedLeaveBalanceFile {
  let rows: WorkbookRow[];
  try {
    rows = readFirstWorksheetRows(workbookBuffer, MAX_ROWS);
  } catch (error) {
    return emptyResult(error instanceof WorkbookReadError ? error.message : 'Unreadable workbook');
  }

  const layout = detectLayout(rows);
  if (!layout) {
    return emptyResult(
      'Unrecognised leave balance workbook. Expected either Employee ID, Leave Type and ' +
        'Leaves Available columns, or Consultant Id and Closing Balance Leaves columns.',
    );
  }

  const preamble = rows
    .slice(0, layout.headerIndex)
    .flatMap((row) => [...row.cells.values()])
    .map((value) => value.trim());
  const asOfLabel =
    preamble.find((value) => /report generated date/i.test(value)) ??
    preamble.find((value) => yearFromText(value) !== null) ??
    null;

  const entries = new Map<string, ParsedLeaveBalanceEntry>();
  const ignoredLeaveTypes: Record<string, number> = {};
  const errors: LeaveBalanceImportIssue[] = [];
  let totalRows = 0;

  for (const row of rows.slice(layout.headerIndex + 1)) {
    const employeeCode = (row.cells.get(layout.codeColumn) ?? '').trim().toUpperCase();
    if (!employeeCode) continue;
    totalRows += 1;

    let leaveType: ImportedLeaveType = 'casual';
    if (layout.typeColumn) {
      const typeName = (row.cells.get(layout.typeColumn) ?? '').trim();
      const mapped = PERMANENT_LEAVE_TYPES[typeName.toLowerCase().replace(/\s+/g, ' ')];
      if (!mapped) {
        const label = typeName || '(blank)';
        ignoredLeaveTypes[label] = (ignoredLeaveTypes[label] ?? 0) + 1;
        continue;
      }
      leaveType = mapped;
    }

    let days = parseDays(row.cells.get(layout.balanceColumn));
    if (days === null && layout.fallbackColumn) {
      days = parseDays(row.cells.get(layout.fallbackColumn));
    }
    if (days === null || Number.isNaN(days)) {
      errors.push({
        rowNumber: row.rowNumber,
        employeeCode,
        reason: days === null ? 'Balance is blank' : 'Balance is not a number',
      });
      continue;
    }
    if (Math.abs(days) > 365) {
      errors.push({ rowNumber: row.rowNumber, employeeCode, reason: 'Balance exceeds 365 days' });
      continue;
    }

    const key = `${employeeCode}\u001f${leaveType}`;
    if (entries.has(key)) {
      errors.push({
        rowNumber: row.rowNumber,
        employeeCode,
        reason: 'Duplicate row for this leave type; the later row was used',
      });
    }
    entries.set(key, { rowNumber: row.rowNumber, employeeCode, leaveType, days });
  }

  if (totalRows === 0) return emptyResult('Workbook contains no employee rows');

  return {
    format: layout.format,
    year: asOfLabel ? yearFromText(asOfLabel) : null,
    asOfLabel,
    totalRows,
    entries: [...entries.values()],
    ignoredLeaveTypes,
    errors,
  };
}
