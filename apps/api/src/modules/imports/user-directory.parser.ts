import type { UserDirectoryImportError } from '@gnomon/shared';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

const REQUIRED_HEADERS = [
  'Emp ID',
  'User ID',
  'Mail ID',
  'Emp name',
  'New Designation',
  'Dept',
  'Leave Approver 1',
  'Leave Approver 2',
  'Email Triggers',
] as const;
const MAX_ROWS = 5_000;
const EmailSchema = z.string().trim().email();

export interface ParsedUserDirectoryRow {
  rowNumber: number;
  employeeId: string;
  userId: string;
  email: string;
  fullName: string;
  designation: string;
  departmentName: string;
  leaveApprover1Name: string | null;
  leaveApprover2Name: string | null;
  emailTriggers: string[];
}

export interface ParsedUserDirectory {
  totalRows: number;
  rows: ParsedUserDirectoryRow[];
  errors: UserDirectoryImportError[];
}

function optionalName(value: string | undefined): string | null {
  const name = value?.trim() ?? '';
  return !name || name.toUpperCase() === 'NA' ? null : name.slice(0, 160);
}

export function parseUserDirectoryCsv(csvText: string): ParsedUserDirectory {
  let records: Record<string, string>[];
  let headers: string[] = [];
  try {
    records = parse(csvText, {
      bom: true,
      columns: (values: string[]) => {
        headers = values.map((value) => value.trim());
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    }) as Record<string, string>[];
  } catch (error) {
    return {
      totalRows: 0,
      rows: [],
      errors: [
        {
          rowNumber: 1,
          employeeId: '',
          reason: `Users CSV could not be parsed: ${error instanceof Error ? error.message : 'invalid format'}`,
        },
      ],
    };
  }
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return {
      totalRows: records.length,
      rows: [],
      errors: [
        {
          rowNumber: 1,
          employeeId: '',
          reason: `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
        },
      ],
    };
  }
  if (records.length > MAX_ROWS) {
    return {
      totalRows: records.length,
      rows: [],
      errors: [
        {
          rowNumber: 1,
          employeeId: '',
          reason: `Users CSV exceeds the ${MAX_ROWS.toLocaleString('en-IN')} row limit`,
        },
      ],
    };
  }

  const rows: ParsedUserDirectoryRow[] = [];
  const errors: UserDirectoryImportError[] = [];
  const employeeIds = new Set<string>();
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const employeeId = (record['Emp ID'] ?? '').trim().toUpperCase();
    const userId = (record['User ID'] ?? '').trim().toLowerCase();
    const email = (record['Mail ID'] ?? '').trim().toLowerCase();
    const fullName = (record['Emp name'] ?? '').trim().replace(/\s+/g, ' ');
    const designation = (record['New Designation'] ?? '').trim();
    const departmentName = (record.Dept ?? '').trim();
    const rowErrors: string[] = [];
    if (!/^[A-Z0-9_-]{2,50}$/.test(employeeId)) rowErrors.push('Emp ID is invalid');
    if (!/^[a-z0-9._-]{2,80}$/.test(userId)) rowErrors.push('User ID is invalid');
    if (!EmailSchema.safeParse(email).success) rowErrors.push('Mail ID is invalid');
    if (!fullName) rowErrors.push('Emp name is required');
    if (!designation) rowErrors.push('New Designation is required');
    if (!departmentName) rowErrors.push('Dept is required');
    if (employeeIds.has(employeeId)) rowErrors.push('Emp ID is duplicated');
    const emailTriggers = (record['Email Triggers'] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value && value.toUpperCase() !== 'NA');
    if (emailTriggers.some((value) => !EmailSchema.safeParse(value).success)) {
      rowErrors.push('Email Triggers contains an invalid email address');
    }
    if (rowErrors.length > 0) {
      errors.push({ rowNumber, employeeId, reason: rowErrors.join('; ') });
      return;
    }
    employeeIds.add(employeeId);
    rows.push({
      rowNumber,
      employeeId,
      userId,
      email,
      fullName,
      designation: designation.slice(0, 160),
      departmentName: departmentName.slice(0, 160),
      leaveApprover1Name: optionalName(record['Leave Approver 1']),
      leaveApprover2Name: optionalName(record['Leave Approver 2']),
      emailTriggers: [...new Set(emailTriggers)],
    });
  });
  return { totalRows: records.length, rows, errors };
}
