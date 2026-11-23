import type { EmployeeDirectoryItemDto } from '@gnomon/shared';

import type { CsvValue } from './csv';

type Person = EmployeeDirectoryItemDto;

export const UNASSIGNED = '__unassigned__';

/* ------------------------------------------------------------ columns */

export const peopleColumnIds = [
  'employee',
  'code',
  'userId',
  'email',
  'designation',
  'department',
  'approver',
  'location',
  'card',
  'source',
  'status',
  'updated',
] as const;
export type PeopleColumnId = (typeof peopleColumnIds)[number];

export const peopleColumnLabels: Record<PeopleColumnId, string> = {
  employee: 'Emp name',
  code: 'Emp ID',
  userId: 'User ID',
  email: 'Mail ID',
  designation: 'Designation',
  department: 'Dept',
  approver: 'Leave approver',
  location: 'Location',
  card: 'Access card',
  source: 'Profile source',
  status: 'Status',
  updated: 'Last updated',
};

export const defaultVisiblePeopleColumns: readonly PeopleColumnId[] = [
  'employee',
  'code',
  'userId',
  'email',
  'designation',
  'department',
  'approver',
  'status',
];

export function parseVisiblePeopleColumns(value: unknown): PeopleColumnId[] | null {
  if (!Array.isArray(value)) return null;
  const valid = peopleColumnIds.filter((id) => value.includes(id));
  return valid.length > 0 ? valid : null;
}

/* ------------------------------------------------------------- values */

const sourceLabels: Record<Person['profileSource'], string> = {
  users_csv: 'Users CSV',
  door_workbook: 'Door workbook',
  biometric_csv: 'Biometric CSV',
  manual: 'Manual',
  system: 'System',
  ldap: 'Active Directory',
};

export function personDepartment(person: Person): string | null {
  return (
    person.hrProfile?.departmentName ??
    person.biometricProfile?.departmentName ??
    person.attendanceIdentity?.departmentName ??
    null
  );
}

export function personDesignation(person: Person): string | null {
  return person.hrProfile?.designation || person.biometricProfile?.designation || null;
}

/** Leave approvers from the users CSV (approver 1, then approver 2). */
export function personApprovers(person: Person): string | null {
  const names = [person.hrProfile?.leaveApprover1Name, person.hrProfile?.leaveApprover2Name].filter(
    (name): name is string => Boolean(name),
  );
  return names.length ? names.join(', ') : null;
}

export function personPrimaryApprover(person: Person): string | null {
  return person.hrProfile?.leaveApprover1Name || person.hrProfile?.leaveApprover2Name || null;
}

export function personContactEmail(person: Person): string {
  return person.email.endsWith('@gnomon.invalid') ? 'Not supplied in workbook' : person.email;
}

export function personSourceLabel(person: Person): string {
  return sourceLabels[person.profileSource];
}

function columnText(person: Person, id: PeopleColumnId): string {
  switch (id) {
    case 'employee':
      return person.displayName;
    case 'code':
      return person.employeeCode;
    case 'userId':
      return person.hrProfile?.userId ?? '';
    case 'email':
      return personContactEmail(person);
    case 'designation':
      return personDesignation(person) ?? '';
    case 'department':
      return personDepartment(person) ?? '';
    case 'approver':
      return personApprovers(person) ?? '';
    case 'location':
      return person.location?.name ?? '';
    case 'card':
      return person.attendanceIdentity?.cardNumber ?? '';
    case 'source':
      return personSourceLabel(person);
    case 'status':
      return person.status === 'active' ? 'Active' : 'Inactive';
    case 'updated':
      return person.updatedAt;
  }
}

/* ------------------------------------------------------------ filters */

export interface PeopleFilters {
  search: string;
  status: 'all' | Person['status'];
  departments: readonly string[];
  designations: readonly string[];
  locations: readonly string[];
  approvers?: readonly string[];
}

const facetValue = (value: string | null | undefined) => value || UNASSIGNED;

export function filterPeople(people: readonly Person[], filters: PeopleFilters): Person[] {
  const term = filters.search.trim().toLowerCase();
  return people.filter((person) => {
    if (filters.status !== 'all' && person.status !== filters.status) return false;
    if (
      filters.departments.length &&
      !filters.departments.includes(facetValue(personDepartment(person)))
    ) {
      return false;
    }
    if (
      filters.designations.length &&
      !filters.designations.includes(facetValue(personDesignation(person)))
    ) {
      return false;
    }
    if (filters.locations.length && !filters.locations.includes(facetValue(person.location?.id))) {
      return false;
    }
    if (
      filters.approvers?.length &&
      !filters.approvers.includes(facetValue(personPrimaryApprover(person))) &&
      !(
        person.hrProfile?.leaveApprover2Name &&
        filters.approvers.includes(person.hrProfile.leaveApprover2Name)
      )
    ) {
      return false;
    }
    if (!term) return true;
    return [
      person.displayName,
      person.employeeCode,
      person.email,
      person.hrProfile?.userId,
      personDesignation(person),
      personDepartment(person),
      person.location?.name,
      person.attendanceIdentity?.cardNumber,
      personApprovers(person),
    ].some((value) => value?.toLowerCase().includes(term));
  });
}

/** Distinct values for a filter, with counts, plus an "Unassigned" bucket. */
export function facetOptions(
  people: readonly Person[],
  pick: (person: Person) => { value: string | null | undefined; label?: string | null },
  unassignedLabel: string,
): Array<{ value: string; label: string; secondary: string }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const person of people) {
    const { value, label } = pick(person);
    const key = facetValue(value);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label: value ? (label ?? value) : unassignedLabel, count: 1 });
  }
  return [...counts.entries()]
    .map(([value, { label, count }]) => ({ value, label, secondary: `${count} people` }))
    .sort((left, right) =>
      left.value === UNASSIGNED
        ? 1
        : right.value === UNASSIGNED
          ? -1
          : left.label.localeCompare(right.label),
    );
}

/* -------------------------------------------------------------- sorting */

export type PeopleSortKey = PeopleColumnId;
export interface PeopleSortRule {
  key: PeopleSortKey;
  direction: 'asc' | 'desc';
}
export const defaultPeopleSort: readonly PeopleSortRule[] = [{ key: 'employee', direction: 'asc' }];

export function parsePeopleSort(value: string): PeopleSortRule[] | null {
  const rules: PeopleSortRule[] = [];
  for (const part of value.split(',')) {
    const [key, direction] = part.split(':');
    if (!peopleColumnIds.includes(key as PeopleSortKey)) return null;
    if (direction !== 'asc' && direction !== 'desc') return null;
    if (rules.some((rule) => rule.key === key)) return null;
    rules.push({ key: key as PeopleSortKey, direction });
  }
  return rules.length > 0 && rules.length <= 3 ? rules : null;
}

export function serializePeopleSort(rules: readonly PeopleSortRule[]): string {
  return rules.map((rule) => `${rule.key}:${rule.direction}`).join(',');
}

/** Click sorts by one column; Shift+click adds or flips a level (max three). */
export function nextPeopleSort(
  rules: readonly PeopleSortRule[],
  key: PeopleSortKey,
  additive: boolean,
): PeopleSortRule[] {
  const initial: 'asc' | 'desc' = key === 'updated' ? 'desc' : 'asc';
  const existing = rules.find((rule) => rule.key === key);
  const flip = (rule: PeopleSortRule): PeopleSortRule => ({
    ...rule,
    direction: rule.direction === 'asc' ? 'desc' : 'asc',
  });
  if (additive) {
    if (existing) return rules.map((rule) => (rule.key === key ? flip(rule) : rule));
    return [...rules, { key, direction: initial }].slice(-3);
  }
  if (existing && rules[0]?.key === key) return [flip(existing)];
  return [{ key, direction: initial }];
}

/* ------------------------------------------------------------- grouping */

export const peopleGroupOptions = [
  'none',
  'department',
  'designation',
  'approver',
  'location',
  'status',
  'source',
] as const;
export type PeopleGroupBy = (typeof peopleGroupOptions)[number];
export const peopleGroupLabels: Record<PeopleGroupBy, string> = {
  none: 'No grouping',
  department: 'Department',
  designation: 'Designation',
  approver: 'Leave approver',
  location: 'Location',
  status: 'Status',
  source: 'Profile source',
};

export function peopleGroupFor(
  person: Person,
  groupBy: Exclude<PeopleGroupBy, 'none'>,
): { key: string; label: string } {
  const value =
    groupBy === 'department'
      ? personDepartment(person)
      : groupBy === 'designation'
        ? personDesignation(person)
        : groupBy === 'approver'
          ? personPrimaryApprover(person)
          : groupBy === 'location'
            ? (person.location?.name ?? null)
            : groupBy === 'status'
              ? columnText(person, 'status')
              : personSourceLabel(person);
  return value
    ? { key: `${groupBy}:${value}`, label: value }
    : { key: `${groupBy}:${UNASSIGNED}`, label: `No ${peopleGroupLabels[groupBy].toLowerCase()}` };
}

/** Sorts rows; when grouped, groups come first (alphabetical, "No …" last). */
export function orderPeople(
  people: readonly Person[],
  rules: readonly PeopleSortRule[],
  groupBy: PeopleGroupBy,
): Person[] {
  return people.slice().sort((left, right) => {
    if (groupBy !== 'none') {
      const leftGroup = peopleGroupFor(left, groupBy);
      const rightGroup = peopleGroupFor(right, groupBy);
      if (leftGroup.key !== rightGroup.key) {
        const leftEmpty = leftGroup.key.endsWith(UNASSIGNED);
        const rightEmpty = rightGroup.key.endsWith(UNASSIGNED);
        if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
        return leftGroup.label.localeCompare(rightGroup.label);
      }
    }
    for (const rule of rules) {
      const leftValue = columnText(left, rule.key);
      const rightValue = columnText(right, rule.key);
      // Blank values always sort last, whatever the direction.
      if (!leftValue !== !rightValue) return leftValue ? -1 : 1;
      const result = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    return left.id.localeCompare(right.id);
  });
}

/* --------------------------------------------------------------- export */

export function buildPeopleExport(
  people: readonly Person[],
  columnIds: readonly PeopleColumnId[],
  groupBy: PeopleGroupBy,
): { headers: string[]; rows: CsvValue[][] } {
  const grouped = groupBy !== 'none';
  return {
    headers: [
      ...(grouped ? [peopleGroupLabels[groupBy]] : []),
      ...columnIds.map((id) => peopleColumnLabels[id]),
    ],
    rows: people.map((person) => [
      ...(grouped ? [peopleGroupFor(person, groupBy).label] : []),
      ...columnIds.map((id) => columnText(person, id) || null),
    ]),
  };
}
