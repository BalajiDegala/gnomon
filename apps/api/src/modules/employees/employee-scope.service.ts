import type { AuthUser, PermissionCode } from '@gnomon/shared';
import { Types, type QueryFilter } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { ShowAssignment } from '../shows/show.model.js';
import { Employee, type EmployeeDocument } from './employee.model.js';

function objectIds(ids: string[]): Types.ObjectId[] {
  return ids.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id));
}

export async function buildEmployeeScopeFilter(
  user: AuthUser,
  permissions: PermissionCode[],
): Promise<QueryFilter<EmployeeDocument>> {
  const grants = user.grants.filter((grant) =>
    grant.permissions.some((permission) => permissions.includes(permission)),
  );
  if (grants.length === 0) {
    throw new HttpError(403, 'You do not have permission to view this workforce data', 'FORBIDDEN');
  }
  if (grants.some((grant) => grant.scope.type === 'company')) return {};

  const filters: QueryFilter<EmployeeDocument>[] = [];
  const directReportGrants = grants.filter((grant) => grant.scope.type === 'direct_reports');
  for (const grant of directReportGrants) {
    const scopedIds = objectIds(grant.scope.ids);
    filters.push({
      reportingManagerId: new Types.ObjectId(user.employeeId),
      ...(scopedIds.length > 0 ? { _id: { $in: scopedIds } } : {}),
    });
  }

  for (const grant of grants.filter((item) => item.scope.type === 'department')) {
    const ids = objectIds(grant.scope.ids);
    if (ids.length > 0) filters.push({ departmentId: { $in: ids } });
  }
  for (const grant of grants.filter((item) => item.scope.type === 'location')) {
    const ids = objectIds(grant.scope.ids);
    if (ids.length > 0) filters.push({ locationId: { $in: ids } });
  }

  const showIds = objectIds(
    grants.filter((grant) => grant.scope.type === 'show').flatMap((grant) => grant.scope.ids),
  );
  if (showIds.length > 0) {
    const assignments = await ShowAssignment.find({ showId: { $in: showIds }, status: 'active' })
      .select({ employeeId: 1 })
      .lean()
      .exec();
    const employeeIds = assignments.map((assignment) => assignment.employeeId);
    if (employeeIds.length > 0) filters.push({ _id: { $in: employeeIds } });
  }

  if (grants.some((grant) => grant.scope.type === 'self')) {
    filters.push({ _id: new Types.ObjectId(user.employeeId) });
  }
  if (filters.length === 0) {
    throw new HttpError(
      403,
      'No employees are available in your assigned scope',
      'SCOPE_FORBIDDEN',
    );
  }
  return filters.length === 1 ? filters[0]! : { $or: filters };
}

export function hasCompanyEmployeePermission(user: AuthUser, permission: PermissionCode): boolean {
  return user.grants.some(
    (grant) => grant.permissions.includes(permission) && grant.scope.type === 'company',
  );
}

export async function assertEmployeeInScope(
  user: AuthUser,
  employeeId: string,
  permission: PermissionCode,
): Promise<void> {
  const scope = await buildEmployeeScopeFilter(user, [permission]);
  const exists = await Employee.exists({ $and: [scope, { _id: employeeId }] });
  if (!exists) {
    throw new HttpError(403, 'This employee is outside your assigned scope', 'SCOPE_FORBIDDEN');
  }
}
