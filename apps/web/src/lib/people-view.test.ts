import type { EmployeeDirectoryItemDto } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import {
  buildPeopleExport,
  filterPeople,
  nextPeopleSort,
  orderPeople,
  parsePeopleSort,
  UNASSIGNED,
} from './people-view';

function person(
  id: string,
  displayName: string,
  department: string | null,
  status: 'active' | 'inactive' = 'active',
): EmployeeDirectoryItemDto {
  return {
    id,
    employeeCode: `E${id}`,
    firstName: displayName,
    lastName: '',
    displayName,
    email: `${id}@example.test`,
    timezone: 'Asia/Kolkata',
    status,
    profileSource: 'manual',
    biometricProfile: null,
    hrProfile: department
      ? {
          source: 'users_csv',
          userId: `u${id}`,
          mailId: `${id}@example.test`,
          fullName: displayName,
          designation: 'Artist',
          departmentName: department,
          leaveApprover1Name: null,
          leaveApprover2Name: null,
          approver1EmployeeId: null,
          approver2EmployeeId: null,
          emailTriggers: [],
          importedAt: '2026-01-01T00:00:00.000Z',
        }
      : null,
    attendanceIdentity: null,
    reportingManager: null,
    location: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const people = [
  person('1', 'Zara', 'Roto'),
  person('2', 'Asha', 'Comp'),
  person('3', 'Ravi', null, 'inactive'),
];
const noFilters = {
  search: '',
  status: 'all' as const,
  departments: [],
  designations: [],
  locations: [],
};

describe('people view', () => {
  it('filters by status, department (including unassigned) and search', () => {
    expect(filterPeople(people, { ...noFilters, status: 'active' }).map((p) => p.id)).toEqual([
      '1',
      '2',
    ]);
    expect(
      filterPeople(people, { ...noFilters, departments: [UNASSIGNED] }).map((p) => p.id),
    ).toEqual(['3']);
    expect(filterPeople(people, { ...noFilters, search: 'roto' }).map((p) => p.id)).toEqual(['1']);
  });

  it('groups by department with unassigned last, then sorts inside groups', () => {
    const ordered = orderPeople(people, [{ key: 'employee', direction: 'asc' }], 'department');
    expect(ordered.map((p) => p.displayName)).toEqual(['Asha', 'Zara', 'Ravi']);
  });

  it('parses and advances multi-level sorts', () => {
    expect(parsePeopleSort('department:asc,employee:desc')).toEqual([
      { key: 'department', direction: 'asc' },
      { key: 'employee', direction: 'desc' },
    ]);
    expect(parsePeopleSort('bogus:asc')).toBeNull();
    expect(nextPeopleSort([{ key: 'employee', direction: 'asc' }], 'department', true)).toEqual([
      { key: 'employee', direction: 'asc' },
      { key: 'department', direction: 'asc' },
    ]);
  });

  it('exports columns in the given order with the group first', () => {
    const csv = buildPeopleExport(people.slice(0, 1), ['department', 'employee'], 'status');
    expect(csv.headers).toEqual(['Status', 'Dept', 'Emp name']);
    expect(csv.rows[0]).toEqual(['Active', 'Roto', 'Zara']);
  });
});
