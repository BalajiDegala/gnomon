import type { ApprovalRouteImportResponse } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { DepartmentApprovalPolicy } from '../policies/department-approval-policy.model.js';
import { parseApprovalRoutesCsv } from './approval-route-import.parser.js';

const DEPARTMENT_GROUPS: Record<string, string[]> = {
  roto: ['Roto'],
  paint: ['Paint'],
  integ: ['Integration'],
  integration: ['Integration'],
  comp: ['Compositing'],
  compositing: ['Compositing'],
  cg: [
    'CG',
    'CG Generalist',
    'Animation',
    'Asset Build',
    'Environment',
    'Lighting',
    'Lookdev',
    'Texturing',
  ],
};

function normalized(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function employeeName(employee: {
  firstName: string;
  lastName: string;
  hrProfile?: { fullName: string } | null;
}) {
  return employee.hrProfile?.fullName ?? `${employee.firstName} ${employee.lastName}`.trim();
}

function resolveEmployee<
  T extends { firstName: string; lastName: string; hrProfile?: { fullName: string } | null },
>(name: string, employees: T[]): T | null {
  const exact = employees.filter(
    (employee) => normalized(employeeName(employee)) === normalized(name),
  );
  if (exact.length === 1) return exact[0]!;
  const wanted = nameTokens(name);
  const subset = employees.filter((employee) => {
    const available = nameTokens(employeeName(employee));
    return wanted.every((token) => available.includes(token));
  });
  return subset.length === 1 ? subset[0]! : null;
}

interface RouteUpdate {
  approver1: { id: Types.ObjectId; name: string } | null;
  approver2s: Map<string, { id: Types.ObjectId; name: string }>;
}

export async function importApprovalRoutesCsv(input: {
  fileName: string;
  csvText: string;
  importedBy: string;
}): Promise<ApprovalRouteImportResponse> {
  const parsed = parseApprovalRoutesCsv(input.csvText);
  if (parsed.errors.length > 0) {
    throw new HttpError(
      400,
      parsed.errors.map((error) => `Row ${error.rowNumber}: ${error.reason}`).join('; '),
      'APPROVAL_ROUTES_INVALID',
    );
  }

  const [employees, policies] = await Promise.all([
    Employee.find({ status: 'active', profileSource: 'users_csv' }).lean().exec(),
    DepartmentApprovalPolicy.find().lean().exec(),
  ]);
  const policiesByDepartment = new Map(policies.map((policy) => [policy.departmentName, policy]));
  const updates = new Map<string, RouteUpdate>();
  const unresolvedApproverNames = new Set<string>();
  const resolvedSecondApprovers = new Set<string>();
  const warnings = new Set<string>();
  const supportRows = parsed.rows.filter((row) => row.section === 'support');

  for (const row of parsed.rows.filter((candidate) => candidate.section === 'artist')) {
    const approver = resolveEmployee(row.approverName, employees);
    if (!approver) {
      unresolvedApproverNames.add(row.approverName);
      continue;
    }
    const targetDepartments = [
      ...new Set(
        row.departmentLabels.flatMap((label) => {
          const departments = DEPARTMENT_GROUPS[normalized(label)];
          if (!departments) warnings.add(`Unknown department label: ${label}`);
          return departments ?? [];
        }),
      ),
    ];
    for (const departmentName of targetDepartments) {
      if (!policiesByDepartment.has(departmentName)) {
        warnings.add(`No department policy exists for ${departmentName}`);
        continue;
      }
      const update = updates.get(departmentName) ?? {
        approver1: null,
        approver2s: new Map<string, { id: Types.ObjectId; name: string }>(),
      };
      const resolved = {
        id: approver._id,
        name: employeeName(approver),
      };
      if (row.stage === 1) {
        if (update.approver1 && String(update.approver1.id) !== String(resolved.id)) {
          warnings.add(`Multiple first approvers were listed for ${departmentName}`);
        } else update.approver1 = resolved;
      } else {
        update.approver2s.set(String(resolved.id), resolved);
        resolvedSecondApprovers.add(String(resolved.id));
      }
      updates.set(departmentName, update);
    }
  }

  let departmentsUpdated = 0;
  let twoStageDepartments = 0;
  for (const [departmentName, update] of updates) {
    if (update.approver2s.size === 0) continue;
    const policy = policiesByDepartment.get(departmentName)!;
    const approver2s = [...update.approver2s.values()];
    const approver1EmployeeId = update.approver1?.id ?? policy.approver1EmployeeId;
    if (!approver1EmployeeId) {
      warnings.add(`Approver 1 remains unresolved for ${departmentName}`);
      continue;
    }
    await DepartmentApprovalPolicy.updateOne(
      { _id: policy._id },
      {
        $set: {
          approvalSteps: 2,
          approver1EmployeeId,
          approver2EmployeeId: approver2s[0]!.id,
          approver2EmployeeIds: approver2s.map((approver) => approver.id),
          ...(update.approver1 ? { importedApprover1Name: update.approver1.name } : {}),
          importedApprover2Name: approver2s.map((approver) => approver.name).join(', '),
          importedApprover2Names: approver2s.map((approver) => approver.name),
          updatedByUserId: new Types.ObjectId(input.importedBy),
        },
        $inc: { version: 1 },
      },
      { runValidators: true },
    ).exec();
    departmentsUpdated += 1;
    twoStageDepartments += 1;
  }

  return {
    fileName: input.fileName,
    departmentsUpdated,
    twoStageDepartments,
    secondApproversResolved: resolvedSecondApprovers.size,
    supportRowsRetainedAsReference: supportRows.length,
    unresolvedApproverNames: [...unresolvedApproverNames].sort(),
    warnings: [...warnings].sort(),
  };
}
