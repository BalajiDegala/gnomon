import type { ParsedEmployeeProfile } from './attendance-import.parser.js';

export interface WorkbookEmployeeCandidate {
  employeeCode: string;
  firstName: string;
  lastName: string;
  attendanceIdentity?: { personnelId: string } | null;
  profileSource: string;
  hrProfile?: { fullName: string } | null;
}

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizedNumericId(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  return String(Number(value));
}

function directoryPersonnelId(value: string): string | null {
  const match = /^DDIH(\d+)$/i.exec(value);
  return match ? normalizedNumericId(match[1]!) : null;
}

function appendLookup<T>(lookup: Map<string, T[]>, key: string, value: T): void {
  const matches = lookup.get(key) ?? [];
  matches.push(value);
  lookup.set(key, matches);
}

function uniqueMatch<T>(lookup: Map<string, T[]>, key: string | null): T | null {
  if (!key) return null;
  const matches = lookup.get(key) ?? [];
  return matches.length === 1 ? matches[0]! : null;
}

export function matchWorkbookEmployeeProfiles<T extends WorkbookEmployeeCandidate>(
  profiles: readonly ParsedEmployeeProfile[],
  employees: readonly T[],
): { matchedEmployees: Map<string, T>; createdCodes: string[] } {
  const byCode = new Map<string, T>();
  const byName = new Map<string, T[]>();
  const byPersonnelId = new Map<string, T[]>();

  for (const employee of employees) {
    byCode.set(employee.employeeCode, employee);
    if (employee.attendanceIdentity?.personnelId) {
      byCode.set(employee.attendanceIdentity.personnelId, employee);
    }
    if (employee.profileSource !== 'users_csv' && employee.profileSource !== 'manual') continue;
    const name = employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`;
    appendLookup(byName, normalizedName(name), employee);
    const personnelId = directoryPersonnelId(employee.employeeCode);
    if (personnelId) appendLookup(byPersonnelId, personnelId, employee);
  }

  const matchedEmployees = new Map<string, T>();
  const createdCodes: string[] = [];
  for (const profile of profiles) {
    const matched =
      byCode.get(profile.employeeCode) ??
      uniqueMatch(byPersonnelId, normalizedNumericId(profile.employeeCode)) ??
      uniqueMatch(byName, normalizedName(`${profile.firstName} ${profile.lastName}`));
    if (matched) matchedEmployees.set(profile.employeeCode, matched);
    else createdCodes.push(profile.employeeCode);
  }
  return { matchedEmployees, createdCodes };
}
