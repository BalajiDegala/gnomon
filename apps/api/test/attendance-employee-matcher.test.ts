import { describe, expect, it } from 'vitest';

import { matchWorkbookEmployeeProfiles } from '../src/modules/imports/attendance-employee-matcher.js';
import { directoryPersonnelIdCandidates } from '../src/modules/imports/attendance-identity.js';
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
  it('maps biometric directory families to controller Personnel IDs', () => {
    expect(directoryPersonnelIdCandidates('DDIC279')).toEqual(['7279']);
    expect(directoryPersonnelIdCandidates('DDIH054')).toEqual(['54', '9054']);
    expect(directoryPersonnelIdCandidates('DDIH0667')).toEqual(['667', '9667']);
    expect(directoryPersonnelIdCandidates('DDII061')).toEqual(['5061']);
    expect(directoryPersonnelIdCandidates('DDHK051')).toEqual([]);
    expect(directoryPersonnelIdCandidates('UNKNOWN104')).toEqual([]);
  });

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

  it('links a later door import to a profile created from biometric attendance', () => {
    const biometric = employee('biometric', 'DDIH667', { profileSource: 'biometric_csv' });
    const result = matchWorkbookEmployeeProfiles([profile('9667')], [biometric]);
    expect(result.matchedEmployees.get('9667')).toBe(biometric);
    expect(result.createdCodes).toEqual([]);
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

  it('prefers the exact name when several Personnel IDs share a directory suffix', () => {
    const directory = employee('directory', 'DDIH104', {
      firstName: 'Naga Jagan',
      lastName: 'Midde',
      hrProfile: { fullName: 'Naga Jagan Midde' },
    });

    const result = matchWorkbookEmployeeProfiles(
      [profile('11104', 'Sanjaya', 'T'), profile('9104', 'Naga Jagan', 'Midde')],
      [directory],
    );

    expect(result.matchedEmployees.get('9104')).toBe(directory);
    expect(result.createdCodes).toEqual(['11104']);
  });

  it('does not link unrelated 10/11-series personnel when the employee is absent', () => {
    const directory = employee('directory', 'DDIH104', {
      firstName: 'Naga Jagan',
      lastName: 'Midde',
    });
    const result = matchWorkbookEmployeeProfiles(
      [profile('10104', 'Dhanamma', 'K'), profile('11104', 'Sanjaya', 'T')],
      [directory],
    );
    expect(result.matchedEmployees.size).toBe(0);
    expect(result.createdCodes).toEqual(['10104', '11104']);
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
