import type { HolidayDto } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { EmployeeLocationAssignment } from '../employees/location.model.js';
import { Holiday, type HolidayDocument } from './holiday.model.js';

export interface ApplicableHoliday extends HolidayDto {
  updatedByUserId: Types.ObjectId;
  updatedAtDate: Date;
}

function toHolidayDto(holiday: HolidayDocument): HolidayDto {
  return {
    id: String(holiday._id),
    date: holiday.date,
    name: holiday.name,
    scopeType: holiday.scopeType,
    locationId: holiday.locationId ? String(holiday.locationId) : null,
    locationCode: null,
    locationName: null,
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
  const employee = await Employee.exists({ _id: employeeId });
  if (!employee) throw new HttpError(404, 'Employee profile not found', 'EMPLOYEE_NOT_FOUND');

  const holidays = await Holiday.find({
    status: 'active',
    scopeType: 'company',
    locationId: null,
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: 1, name: 1 })
    .lean()
    .exec();
  return holidays.map(toHolidayDto);
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
