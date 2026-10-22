import type { ParsedEmployeeProfile } from './attendance-import.parser.js';
import {
  directoryPersonnelIdCandidates,
  normalizeAttendanceName,
  normalizePersonnelId,
} from './attendance-identity.js';

export interface WorkbookEmployeeCandidate {
  employeeCode: string;
  firstName: string;
  lastName: string;
  attendanceIdentity?: { personnelId: string } | null;
  profileSource: string;
  hrProfile?: { fullName: string } | null;
}

function normalizedName(value: string): string {
  return normalizeAttendanceName(value);
}

function appendLookup<T>(lookup: Map<string, T[]>, key: string, value: T): void {
  const matches = lookup.get(key) ?? [];
  matches.push(value);
  lookup.set(key, matches);
}

function uniqueMatch<T>(
  lookup: Map<string, T[]>,
  key: string | null,
  used: Set<T> = new Set(),
): T | null {
  if (!key) return null;
  const matches = (lookup.get(key) ?? []).filter((match) => !used.has(match));
  return matches.length === 1 ? matches[0]! : null;
}

export function matchWorkbookEmployeeProfiles<T extends WorkbookEmployeeCandidate>(
  profiles: readonly ParsedEmployeeProfile[],
  employees: readonly T[],
): { matchedEmployees: Map<string, T>; createdCodes: string[] } {
  const byCode = new Map<string, T>();
  const byName = new Map<string, T[]>();
  const byPersonnelId = new Map<string, T[]>();
  const matchedEmployees = new Map<string, T>();
  const usedEmployees = new Set<T>();

  for (const employee of employees) {
    byCode.set(employee.employeeCode, employee);
    if (employee.attendanceIdentity?.personnelId) {
      byCode.set(employee.attendanceIdentity.personnelId, employee);
    }
    if (!['users_csv', 'biometric_csv', 'manual'].includes(employee.profileSource)) continue;
    const name = employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`;
    appendLookup(byName, normalizedName(name), employee);
    for (const personnelId of directoryPersonnelIdCandidates(employee.employeeCode)) {
      appendLookup(byPersonnelId, personnelId, employee);
    }
  }

  const createdCodes: string[] = [];
  for (const profile of profiles) {
    const matched =
      (byCode.get(profile.employeeCode) && !usedEmployees.has(byCode.get(profile.employeeCode)!)
        ? byCode.get(profile.employeeCode)
        : null) ??
      uniqueMatch(
        byName,
        normalizedName(`${profile.firstName} ${profile.lastName}`),
        usedEmployees,
      );
    if (matched) {
      matchedEmployees.set(profile.employeeCode, matched);
      usedEmployees.add(matched);
    }
  }
  for (const profile of profiles) {
    if (matchedEmployees.has(profile.employeeCode)) continue;
    const matched = uniqueMatch(
      byPersonnelId,
      normalizePersonnelId(profile.employeeCode),
      usedEmployees,
    );
    if (matched) {
      matchedEmployees.set(profile.employeeCode, matched);
      usedEmployees.add(matched);
    } else {
      createdCodes.push(profile.employeeCode);
    }
  }
  return { matchedEmployees, createdCodes };
}
