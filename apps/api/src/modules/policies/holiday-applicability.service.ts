import type { HolidayDto } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { EmployeeLocationAssignment, Location } from '../employees/location.model.js';
import { Holiday, type HolidayDocument } from './holiday.model.js';

export interface ApplicableHoliday extends HolidayDto {
  updatedByUserId: Types.ObjectId;
  updatedAtDate: Date;
}

function toHolidayDto(
  holiday: HolidayDocument,
  location?: { code: string; name: string },
): HolidayDto {
  return {
    id: String(holiday._id),
    date: holiday.date,
    name: holiday.name,
    scopeType: holiday.scopeType,
    locationId: holiday.locationId ? String(holiday.locationId) : null,
    locationCode: location?.code ?? null,
    locationName: location?.name ?? null,
    status: holiday.status,
    createdAt: holiday.createdAt.toISOString(),
    updatedAt: holiday.updatedAt.toISOString(),
  };
}

export async function listApplicableHolidays(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<HolidayDto[]> {
  const [employee, assignments, assignmentHistory] = await Promise.all([
    Employee.findById(employeeId).select({ locationId: 1 }).lean().exec(),
    EmployeeLocationAssignment.find({
      employeeId,
      effectiveFrom: { $lte: endDate },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: startDate } }],
    })
      .sort({ effectiveFrom: 1 })
      .lean()
      .exec(),
    EmployeeLocationAssignment.exists({ employeeId }),
  ]);
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');

  const legacyLocationId = assignmentHistory === null ? employee.locationId : null;
  const locationIds = [
    ...(legacyLocationId ? [legacyLocationId] : []),
    ...assignments.flatMap((assignment) => (assignment.locationId ? [assignment.locationId] : [])),
  ];
  const scopes: Array<Record<string, unknown>> = [{ scopeType: 'company', locationId: null }];
  if (locationIds.length > 0) {
    scopes.push({ scopeType: 'location', locationId: { $in: locationIds } });
  }

  const holidays = await Holiday.find({
    status: 'active',
    date: { $gte: startDate, $lte: endDate },
    $or: scopes,
  })
    .sort({ date: 1, scopeType: 1, name: 1 })
    .lean()
    .exec();
  const applicable = holidays.filter((holiday) => {
    if (holiday.scopeType === 'company') return true;
    if (!holiday.locationId) return false;
    if (assignments.length === 0) return Boolean(legacyLocationId?.equals(holiday.locationId));
    return assignments.some(
      (assignment) =>
        assignment.locationId?.equals(holiday.locationId) &&
        assignment.effectiveFrom <= holiday.date &&
        (assignment.effectiveUntil === null || assignment.effectiveUntil >= holiday.date),
    );
  });
  const applicableLocationIds = applicable.flatMap((holiday) =>
    holiday.locationId ? [holiday.locationId] : [],
  );
  const locations = await Location.find({ _id: { $in: applicableLocationIds } })
    .select({ code: 1, name: 1 })
    .lean()
    .exec();
  const locationById = new Map(locations.map((location) => [String(location._id), location]));

  return applicable.map((holiday) =>
    toHolidayDto(
      holiday,
      holiday.locationId ? locationById.get(String(holiday.locationId)) : undefined,
    ),
  );
}

export async function findApplicableHoliday(
  employeeId: string,
  workDate: string,
): Promise<ApplicableHoliday | null> {
  const holiday = (await listApplicableHolidays(employeeId, workDate, workDate))[0];
  if (!holiday) return null;
  const audit = await Holiday.findById(holiday.id)
    .select({ updatedByUserId: 1, updatedAt: 1 })
    .lean()
    .exec();
  return audit
    ? { ...holiday, updatedByUserId: audit.updatedByUserId, updatedAtDate: audit.updatedAt }
    : null;
}

export async function listEmployeeIdsAtLocation(
  locationId: Types.ObjectId,
  workDate: string,
): Promise<Types.ObjectId[]> {
  const [assignedEmployeeIds, employeesAtCurrentLocation, employeesWithHistory] = await Promise.all(
    [
      EmployeeLocationAssignment.find({
        locationId,
        effectiveFrom: { $lte: workDate },
        $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: workDate } }],
      })
        .distinct('employeeId')
        .exec(),
      Employee.find({ locationId }).distinct('_id').exec(),
      EmployeeLocationAssignment.distinct('employeeId').exec(),
    ],
  );
  const historyIds = new Set(employeesWithHistory.map(String));
  const employeeIds = new Map<string, Types.ObjectId>();
  assignedEmployeeIds.forEach((employeeId) => employeeIds.set(String(employeeId), employeeId));
  employeesAtCurrentLocation.forEach((employeeId) => {
    if (!historyIds.has(String(employeeId))) employeeIds.set(String(employeeId), employeeId);
  });
  return [...employeeIds.values()];
}
