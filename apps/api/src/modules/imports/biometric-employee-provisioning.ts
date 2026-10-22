import type { Types } from 'mongoose';

import type { EmployeeDocument } from '../employees/employee.model.js';
import {
  directoryPersonnelIdCandidates,
  normalizeAttendanceName,
  normalizePersonnelId,
} from './attendance-identity.js';
import type { ParsedAttendanceRow } from './attendance-import.parser.js';

export interface BiometricEmployeeProfile {
  employeeCode: string;
  fullName: string;
  departmentName: string | null;
  designation: string | null;
  companyName: string | null;
}

type Candidate = Pick<
  EmployeeDocument,
  | '_id'
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'status'
  | 'attendanceIdentity'
  | 'hrProfile'
  | 'biometricProfile'
>;

/** Read-only: the same identity decisions are used by previews and committed imports. */
export function planBiometricEmployees(rows: ParsedAttendanceRow[], employees: Candidate[]) {
  const employeeIds = new Map<string, Types.ObjectId>();
  const provisionableEmployees: BiometricEmployeeProfile[] = [];
  const rejectionReasons = new Map<string, string>();
  const byCode = new Map<string, ParsedAttendanceRow[]>();
  for (const row of rows) {
    const group = byCode.get(row.employeeCode) ?? [];
    group.push(row);
    byCode.set(row.employeeCode, group);
  }

  for (const [code, group] of byCode) {
    const namedRows = group.filter((row) => row.rawPayload.employee_name?.trim());
    const names = new Set(
      namedRows.map((row) => normalizeAttendanceName(row.rawPayload.employee_name!)),
    );
    if (names.size > 1) {
      rejectionReasons.set(
        code,
        'Conflicting employee names for this code; review the source file',
      );
      continue;
    }
    // Exact directory codes take precedence over controller aliases and names.
    let matches = employees.filter((employee) => employee.employeeCode === code);
    if (matches.length === 0) {
      matches = employees.filter((employee) => employee.attendanceIdentity?.personnelId === code);
    }
    if (matches.length === 0) {
      const candidates = new Set(directoryPersonnelIdCandidates(code));
      matches = employees.filter((employee) =>
        candidates.has(normalizePersonnelId(employee.attendanceIdentity?.personnelId ?? '') ?? ''),
      );
    }
    if (matches.length === 0 && names.size === 1 && !names.has('')) {
      matches = employees.filter((employee) =>
        [
          `${employee.firstName} ${employee.lastName}`,
          employee.hrProfile?.fullName ?? '',
          employee.biometricProfile?.fullName ?? '',
        ].some((name) => names.has(normalizeAttendanceName(name))),
      );
    }
    if (matches.length > 1) {
      rejectionReasons.set(
        code,
        'Multiple employees match this identity; review the employee mapping',
      );
    } else if (matches[0]?.status === 'inactive') {
      rejectionReasons.set(code, 'The matching employee is inactive; review the employee status');
    } else if (matches[0]) {
      employeeIds.set(code, matches[0]._id);
    } else if (names.size !== 1 || names.has('')) {
      rejectionReasons.set(
        code,
        'Employee Name is required to create a missing biometric employee',
      );
    } else {
      // Keep the latest supplied metadata, without modifying existing directory profiles.
      const latest = namedRows.reduce((left, right) =>
        left.occurredAt > right.occurredAt ? left : right,
      );
      const value = (key: string) => latest.rawPayload[key]?.trim().slice(0, 255) || null;
      provisionableEmployees.push({
        employeeCode: code,
        fullName: value('employee_name')!,
        departmentName: value('department'),
        designation: value('designation') ?? value('degination'),
        companyName: value('company'),
      });
    }
  }
  return { employeeIds, provisionableEmployees, rejectionReasons };
}
