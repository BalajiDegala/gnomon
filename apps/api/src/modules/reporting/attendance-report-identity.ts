import type { EmployeeDocument } from '../employees/employee.model.js';
import {
  directoryPersonnelIdCandidates,
  normalizeAttendanceName,
  normalizePersonnelId,
} from '../imports/attendance-identity.js';

type ReportEmployee = Pick<
  EmployeeDocument,
  | '_id'
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'profileSource'
  | 'hrProfile'
  | 'biometricProfile'
  | 'attendanceIdentity'
>;

function employeeNames(employee: ReportEmployee): Set<string> {
  return new Set(
    [
      employee.hrProfile?.fullName,
      employee.biometricProfile?.fullName,
      `${employee.firstName} ${employee.lastName}`,
    ]
      .filter((name): name is string => Boolean(name?.trim()))
      .map(normalizeAttendanceName),
  );
}

/** Resolve controller aliases using only employees already inside the report's scope. */
export function attendanceReportEmployees<T extends ReportEmployee>(
  employees: readonly T[],
): Map<string, T> {
  const resolved = new Map(employees.map((employee) => [String(employee._id), employee]));
  const mastersByCard = new Map<string, T[]>();
  const mastersByPersonnelId = new Map<string, T[]>();
  for (const employee of employees) {
    if (employee.profileSource === 'door_workbook' || employee.profileSource === 'system') continue;
    // The directory family identifies both export representations: for example,
    // DDIH556 is personnel 556 in an older export and 9556 in a newer one.
    for (const personnelId of directoryPersonnelIdCandidates(employee.employeeCode)) {
      const candidates = mastersByPersonnelId.get(personnelId) ?? [];
      candidates.push(employee);
      mastersByPersonnelId.set(personnelId, candidates);
    }
    const card = employee.attendanceIdentity?.cardNumber?.trim();
    if (!card) continue;
    const candidates = mastersByCard.get(card) ?? [];
    candidates.push(employee);
    mastersByCard.set(card, candidates);
  }

  for (const employee of employees) {
    if (employee.profileSource !== 'door_workbook') continue;
    const personnelId = normalizePersonnelId(
      employee.attendanceIdentity?.personnelId ?? employee.employeeCode,
    );
    const codeCandidates = personnelId ? (mastersByPersonnelId.get(personnelId) ?? []) : [];
    if (codeCandidates.length > 0) {
      if (codeCandidates.length === 1) resolved.set(String(employee._id), codeCandidates[0]!);
      continue;
    }
    const card = employee.attendanceIdentity?.cardNumber?.trim();
    if (!card) continue;
    const candidates = mastersByCard.get(card) ?? [];
    // A reused/shared card is not enough evidence to choose an employee.
    if (candidates.length !== 1) continue;
    const master = candidates[0]!;
    const masterNames = employeeNames(master);
    const matchesName = [...employeeNames(employee)].some((name) => masterNames.has(name));
    if (matchesName) resolved.set(String(employee._id), master);
  }
  return resolved;
}

export function attendanceReportDepartment(employee: ReportEmployee | undefined): string | null {
  for (const value of [
    employee?.hrProfile?.departmentName,
    employee?.biometricProfile?.departmentName,
    employee?.attendanceIdentity?.departmentName,
  ]) {
    const department = value?.trim();
    if (department && department.toLowerCase() !== 'department name') return department;
  }
  return null;
}
