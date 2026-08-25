import { describe, expect, it } from 'vitest';

import { matchWorkbookEmployeeProfiles } from '../src/modules/imports/attendance-employee-matcher.js';
import type { ParsedEmployeeProfile } from '../src/modules/imports/attendance-import.parser.js';

function profile(
  employeeCode: string,
  firstName = 'Abhishek',
  lastName = 'Donikena',
): ParsedEmployeeProfile {
  return {
    employeeCode,
    firstName,
    lastName,
    departmentName: 'Production',
    cardNumber: null,
    lastSeenAt: new Date('2026-06-30T13:50:27.000Z'),
  };
}

function employee(
  id: string,
  employeeCode: string,
  overrides: Partial<{
    firstName: string;
    lastName: string;
    attendanceIdentity: { personnelId: string } | null;
    profileSource: string;
    hrProfile: { fullName: string } | null;
  }> = {},
) {
  return {
    id,
    employeeCode,
    firstName: 'Abhishek',
    lastName: 'Donikena',
    attendanceIdentity: null,
    profileSource: 'users_csv',
    hrProfile: null,
    ...overrides,
  };
}

describe('matchWorkbookEmployeeProfiles', () => {
  it('matches exact employee and attendance identity codes', () => {
    const exact = employee('exact', '667');
    const identity = employee('identity', 'DDIH668', {
      attendanceIdentity: { personnelId: '900668' },
    });

    const result = matchWorkbookEmployeeProfiles(
      [profile('667'), profile('900668')],
      [exact, identity],
    );

    expect(result.matchedEmployees.get('667')).toBe(exact);
    expect(result.matchedEmployees.get('900668')).toBe(identity);
    expect(result.createdCodes).toEqual([]);
  });

  it('matches a numeric door code to a unique DDIH personnel suffix', () => {
    const directory = employee('directory', 'DDIH0667');

    const result = matchWorkbookEmployeeProfiles([profile('667')], [directory]);

    expect(result.matchedEmployees.get('667')).toBe(directory);
  });

  it('falls back to a unique normalized HR name', () => {
    const directory = employee('directory', 'HR-667', {
      firstName: 'Unused',
      lastName: 'Name',
      hrProfile: { fullName: 'Abhíshék Donikena' },
    });

    const result = matchWorkbookEmployeeProfiles([profile('door-667')], [directory]);

    expect(result.matchedEmployees.get('door-667')).toBe(directory);
  });

  it('creates a profile when directory matches are absent or ambiguous', () => {
    const first = employee('first', 'DDIH667');
    const second = employee('second', 'DDIH0667', { profileSource: 'manual' });
    const doorOnly = employee('door', '900667', {
      profileSource: 'door_workbook',
      hrProfile: { fullName: 'Different Name' },
    });

    const result = matchWorkbookEmployeeProfiles(
      [profile('667'), profile('not-numeric', 'Different', 'Name')],
      [first, second, doorOnly],
    );

    expect(result.matchedEmployees.size).toBe(0);
    expect(result.createdCodes).toEqual(['667', 'not-numeric']);
  });
});
