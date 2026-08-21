import type { UserDirectoryImportResponse } from '@gnomon/shared';
import { Types } from 'mongoose';

import { User } from '../auth/user.model.js';
import { AttendanceEvent } from '../attendance/attendance-event.model.js';
import { EmployeeAuditEvent } from '../employees/employee-audit.model.js';
import {
  Employee,
  type EmployeeDocument,
  type EmployeeRecord,
} from '../employees/employee.model.js';
import { DepartmentApprovalPolicy } from '../policies/department-approval-policy.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { parseUserDirectoryCsv, type ParsedUserDirectoryRow } from './user-directory.parser.js';

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function nameTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((token) => token && !/^\d+$/.test(token)),
    ),
  ].sort();
}

function levenshtein(left: string, right: string): number {
  const distance = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = distance[0]!;
    distance[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = distance[rightIndex]!;
      distance[rightIndex] = Math.min(
        distance[rightIndex]! + 1,
        distance[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return distance[right.length]!;
}

function abbreviationMatch(left: string, right: string): boolean {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  let longMatches = 0;
  const available = [...longer];
  for (const token of shorter) {
    const index = available.findIndex(
      (candidate) => candidate === token || (token.length === 1 && candidate.startsWith(token)),
    );
    if (index < 0) return false;
    if (token.length >= 4 && available[index] === token) longMatches += 1;
    available.splice(index, 1);
  }
  return shorter.length >= 2 && longMatches >= 1;
}

function nameSimilarity(left: string, right: string): number {
  if (abbreviationMatch(left, right)) return 0.9;
  const compactLeft = normalizedName(left);
  const compactRight = normalizedName(right);
  const sortedLeft = nameTokens(left).join('');
  const sortedRight = nameTokens(right).join('');
  const similarity = (a: string, b: string) =>
    1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return Math.max(similarity(compactLeft, compactRight), similarity(sortedLeft, sortedRight));
}

function employeeDisplayName(employee: EmployeeDocument): string {
  return employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`.trim();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = 'Employee', ...rest] = fullName.split(/\s+/);
  return { firstName: firstName.slice(0, 80), lastName: rest.join(' ').slice(0, 80) || firstName };
}

function mostCommon(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (
    [...counts.entries()].sort(
      ([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount || leftName.localeCompare(rightName),
    )[0]?.[0] ?? null
  );
}

function findApprover(name: string | null, employees: EmployeeRecord[]): EmployeeRecord | null {
  if (!name) return null;
  const exact = employees.filter(
    (employee) => normalizedName(employeeDisplayName(employee)) === normalizedName(name),
  );
  if (exact.length === 1) return exact[0]!;
  const nameParts = nameTokens(name);
  const subset = employees.filter((employee) => {
    const employeeParts = nameTokens(employeeDisplayName(employee));
    return nameParts.every((part) => employeeParts.includes(part));
  });
  return subset.length === 1 ? subset[0]! : null;
}

function matchRowsToEmployees(rows: ParsedUserDirectoryRow[], employees: EmployeeRecord[]) {
  const matches = new Map<ParsedUserDirectoryRow, EmployeeRecord>();
  const usedEmployees = new Set<string>();
  const assign = (row: ParsedUserDirectoryRow, employee: EmployeeRecord | undefined) => {
    if (!employee || usedEmployees.has(String(employee._id)) || matches.has(row)) return false;
    matches.set(row, employee);
    usedEmployees.add(String(employee._id));
    return true;
  };

  const userIdCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const row of rows) {
    userIdCounts.set(row.userId, (userIdCounts.get(row.userId) ?? 0) + 1);
    emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
    assign(
      row,
      employees.find((employee) => employee.employeeCode === row.employeeId),
    );
  }
  for (const row of rows) {
    if (matches.has(row) || userIdCounts.get(row.userId) !== 1) continue;
    assign(
      row,
      employees.find((employee) => employee.hrProfile?.userId === row.userId),
    );
  }
  for (const row of rows) {
    if (matches.has(row) || emailCounts.get(row.email) !== 1) continue;
    assign(
      row,
      employees.find(
        (employee) => employee.email === row.email || employee.hrProfile?.mailId === row.email,
      ),
    );
  }
  for (const row of rows) {
    if (matches.has(row)) continue;
    const candidates = employees.filter(
      (employee) => normalizedName(employeeDisplayName(employee)) === normalizedName(row.fullName),
    );
    if (candidates.length === 1) assign(row, candidates[0]);
  }
  for (const row of rows) {
    if (matches.has(row) || !row.employeeId.startsWith('DDIH')) continue;
    const suffix = String(Number(row.employeeId.match(/\d+$/)?.[0] ?? 'NaN'));
    assign(
      row,
      employees.find(
        (employee) =>
          employee.attendanceIdentity &&
          String(Number(employee.attendanceIdentity.personnelId)) === suffix,
      ),
    );
  }

  const proposals = rows
    .filter((row) => !matches.has(row))
    .flatMap((row) => {
      const ranked = employees
        .filter(
          (employee) => employee.attendanceIdentity && !usedEmployees.has(String(employee._id)),
        )
        .map((employee) => ({
          employee,
          score: nameSimilarity(row.fullName, employeeDisplayName(employee)),
        }))
        .sort((left, right) => right.score - left.score);
      const best = ranked[0];
      if (!best || best.score < 0.62 || best.score - (ranked[1]?.score ?? 0) < 0.12) return [];
      return [{ row, employee: best.employee, score: best.score }];
    })
    .sort((left, right) => right.score - left.score);
  for (const proposal of proposals) assign(proposal.row, proposal.employee);
  return matches;
}

function findDoorProfileForRow(
  row: ParsedUserDirectoryRow,
  target: EmployeeRecord,
  employees: EmployeeRecord[],
  importedEmployeeIds: Set<string>,
): EmployeeRecord | null {
  const candidates = employees.filter(
    (employee) =>
      employee.attendanceIdentity &&
      !employee._id.equals(target._id) &&
      !importedEmployeeIds.has(String(employee._id)),
  );
  if (row.employeeId.startsWith('DDIH')) {
    const suffix = String(Number(row.employeeId.match(/\d+$/)?.[0] ?? 'NaN'));
    const byPersonnelId = candidates.filter(
      (employee) => String(Number(employee.attendanceIdentity!.personnelId)) === suffix,
    );
    if (byPersonnelId.length === 1) return byPersonnelId[0]!;
  }
  const exact = candidates.filter(
    (employee) => normalizedName(employeeDisplayName(employee)) === normalizedName(row.fullName),
  );
  if (exact.length === 1) return exact[0]!;
  const ranked = candidates
    .map((employee) => ({
      employee,
      score: nameSimilarity(row.fullName, employeeDisplayName(employee)),
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 0.75 || best.score - (ranked[1]?.score ?? 0) < 0.15) return null;
  return best.employee;
}

async function mergeDoorProfile(source: EmployeeRecord, target: EmployeeRecord): Promise<void> {
  const attendanceIdentity = source.attendanceIdentity;
  if (!attendanceIdentity) return;
  const workDates = await AttendanceEvent.distinct('workDate', { employeeId: source._id });
  source.attendanceIdentity = null;
  source.profileSource = 'door_workbook';
  source.status = 'inactive';
  await source.save();
  target.attendanceIdentity = attendanceIdentity;
  await target.save();
  await AttendanceEvent.updateMany(
    { employeeId: source._id },
    { $set: { employeeId: target._id } },
  ).exec();
  await Promise.all(
    workDates.map((workDate) => reconcileDailyTimecard(String(target._id), workDate)),
  );
}

export async function importUserDirectoryCsv(input: {
  fileName: string;
  csvText: string;
  importedBy: string;
}): Promise<UserDirectoryImportResponse> {
  await Promise.all([Employee.syncIndexes(), DepartmentApprovalPolicy.createIndexes()]);
  const parsed = parseUserDirectoryCsv(input.csvText);
  if (parsed.rows.length === 0) {
    return {
      fileName: input.fileName,
      totalRows: parsed.totalRows,
      importedRows: 0,
      createdEmployees: 0,
      updatedEmployees: 0,
      attendanceIdentitiesLinked: 0,
      usersWithoutAttendanceIdentity: 0,
      archivedDoorProfiles: 0,
      unresolvedApproverNames: [],
      errors: parsed.errors,
    };
  }

  const importedAt = new Date();
  const existingEmployees = await Employee.find().exec();
  const matches = matchRowsToEmployees(parsed.rows, existingEmployees);
  let createdEmployees = 0;
  let updatedEmployees = 0;
  const importedEmployees: EmployeeRecord[] = [];
  const createdEmployeeIds = new Set<string>();

  for (const row of parsed.rows) {
    const names = splitName(row.fullName);
    let employee = matches.get(row);
    const emailOwner = await Employee.findOne({ email: row.email })
      .select({ _id: 1 })
      .lean()
      .exec();
    const internalEmail =
      emailOwner && (!employee || String(emailOwner._id) !== String(employee._id))
        ? `directory.${row.employeeId.toLowerCase()}@gnomon.invalid`
        : row.email;
    if (!employee) {
      employee = await Employee.create({
        employeeCode: row.employeeId,
        ...names,
        email: internalEmail,
        timezone: 'Asia/Kolkata',
        reportingManagerId: null,
        departmentId: null,
        locationId: null,
        attendanceIdentity: null,
        profileSource: 'users_csv',
        status: 'active',
      });
      createdEmployees += 1;
      createdEmployeeIds.add(String(employee._id));
    } else {
      employee.set({
        employeeCode: row.employeeId,
        ...names,
        email: internalEmail,
        status: 'active',
      });
      updatedEmployees += 1;
    }
    employee.profileSource = 'users_csv';
    employee.hrProfile = {
      source: 'users_csv',
      userId: row.userId,
      mailId: row.email,
      fullName: row.fullName,
      designation: row.designation,
      departmentName: row.departmentName,
      leaveApprover1Name: row.leaveApprover1Name,
      leaveApprover2Name: row.leaveApprover2Name,
      approver1EmployeeId: null,
      approver2EmployeeId: null,
      emailTriggers: row.emailTriggers,
      importedAt,
    };
    await employee.save();
    importedEmployees.push(employee);
  }

  const importedEmployeeIds = new Set(importedEmployees.map((employee) => String(employee._id)));
  for (const [index, row] of parsed.rows.entries()) {
    const employee = importedEmployees[index]!;
    if (employee.attendanceIdentity) continue;
    const doorProfile = findDoorProfileForRow(
      row,
      employee,
      existingEmployees,
      importedEmployeeIds,
    );
    if (doorProfile) await mergeDoorProfile(doorProfile, employee);
  }

  const unresolvedApprovers = new Set<string>();
  for (const employee of importedEmployees) {
    const approver1 = findApprover(employee.hrProfile!.leaveApprover1Name, importedEmployees);
    const approver2 = findApprover(employee.hrProfile!.leaveApprover2Name, importedEmployees);
    if (employee.hrProfile!.leaveApprover1Name && !approver1) {
      unresolvedApprovers.add(employee.hrProfile!.leaveApprover1Name);
    }
    if (employee.hrProfile!.leaveApprover2Name && !approver2) {
      unresolvedApprovers.add(employee.hrProfile!.leaveApprover2Name);
    }
    employee.hrProfile!.approver1EmployeeId = approver1?._id ?? null;
    employee.hrProfile!.approver2EmployeeId = approver2?._id ?? null;
    employee.reportingManagerId =
      approver1 && !approver1._id.equals(employee._id) ? approver1._id : null;
    await employee.save();
  }

  const employeesByDepartment = new Map<string, EmployeeRecord[]>();
  for (const employee of importedEmployees) {
    const department = employee.hrProfile!.departmentName;
    const values = employeesByDepartment.get(department) ?? [];
    values.push(employee);
    employeesByDepartment.set(department, values);
  }
  for (const [departmentName, employees] of employeesByDepartment) {
    const importedApprover1Name = mostCommon(
      employees.map((employee) => employee.hrProfile!.leaveApprover1Name),
    );
    const importedApprover2Name = mostCommon(
      employees.map((employee) => employee.hrProfile!.leaveApprover2Name),
    );
    const approver1 = findApprover(importedApprover1Name, importedEmployees);
    const approver2 = findApprover(importedApprover2Name, importedEmployees);
    const emailTriggers = [
      ...new Set(employees.flatMap((employee) => employee.hrProfile!.emailTriggers)),
    ];
    await DepartmentApprovalPolicy.findOneAndUpdate(
      { departmentName },
      {
        $set: { importedApprover1Name, importedApprover2Name },
        $setOnInsert: {
          approvalSteps: importedApprover2Name ? 2 : 1,
          approver1EmployeeId: approver1?._id ?? null,
          approver2EmployeeId: approver2?._id ?? null,
          approver2EmployeeIds: approver2 ? [approver2._id] : [],
          importedApprover2Names: importedApprover2Name ? [importedApprover2Name] : [],
          emailTriggers,
          version: 1,
          updatedByUserId: new Types.ObjectId(input.importedBy),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).exec();
  }

  const importedIds = importedEmployees.map((employee) => employee._id);
  const systemEmployeeIds = (await User.find().select({ employeeId: 1 }).lean().exec()).map(
    (user) => user.employeeId,
  );
  await Employee.updateMany(
    { _id: { $in: systemEmployeeIds, $nin: importedIds } },
    { $set: { profileSource: 'system' } },
  ).exec();
  const archiveResult = await Employee.updateMany(
    {
      _id: { $nin: [...importedIds, ...systemEmployeeIds] },
      attendanceIdentity: { $ne: null },
    },
    { $set: { profileSource: 'door_workbook', status: 'inactive' } },
  ).exec();
  const accountUpdates = importedEmployees.map((employee) => ({
    updateOne: {
      filter: { employeeId: employee._id },
      update: { $set: { email: employee.email } },
    },
  }));
  if (accountUpdates.length > 0) await User.bulkWrite(accountUpdates, { ordered: false });

  await EmployeeAuditEvent.insertMany(
    importedEmployees.map((employee) => ({
      employeeId: employee._id,
      actorUserId: new Types.ObjectId(input.importedBy),
      action: createdEmployeeIds.has(String(employee._id)) ? 'created' : 'updated',
      changes: {
        source: 'users_csv',
        employeeCode: employee.employeeCode,
        userId: employee.hrProfile!.userId,
      },
    })),
    { ordered: false },
  );

  const attendanceIdentitiesLinked = importedEmployees.filter(
    (employee) => employee.attendanceIdentity,
  ).length;
  return {
    fileName: input.fileName,
    totalRows: parsed.totalRows,
    importedRows: parsed.rows.length,
    createdEmployees,
    updatedEmployees,
    attendanceIdentitiesLinked,
    usersWithoutAttendanceIdentity: importedEmployees.length - attendanceIdentitiesLinked,
    archivedDoorProfiles: archiveResult.modifiedCount,
    unresolvedApproverNames: [...unresolvedApprovers].sort(),
    errors: parsed.errors,
  };
}
