import { getWorkDate, type LeaveBalanceImportResponse } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { LeaveBalance, LeaveRequest } from '../leaves/leave.model.js';
import { parseLeaveBalanceWorkbook } from './leave-balance-workbook.parser.js';

export interface LeaveBalanceImportInput {
  fileName: string;
  workbookBuffer: Buffer;
  importedBy: string;
}

/**
 * Import HRMS leave balances. Each imported figure is the balance still available
 * as of the report, so it is stored such that the employee's leave page shows
 * exactly that figure; leave applied in the app afterwards is deducted from it.
 */
export async function importLeaveBalanceWorkbook(
  input: LeaveBalanceImportInput,
): Promise<LeaveBalanceImportResponse> {
  const parsed = parseLeaveBalanceWorkbook(input.workbookBuffer);
  if (!parsed.format) {
    throw new HttpError(
      400,
      parsed.errors[0]?.reason ?? 'Unrecognised leave balance workbook',
      'INVALID_WORKBOOK',
    );
  }

  const currentYear = Number(getWorkDate(new Date()).slice(0, 4));
  const year =
    parsed.year && parsed.year >= 2000 && parsed.year <= 2200 ? parsed.year : currentYear;

  const codes = [...new Set(parsed.entries.map((entry) => entry.employeeCode))];
  const employees = await Employee.find({ employeeCode: { $in: codes } })
    .select({ employeeCode: 1 })
    .lean()
    .exec();
  const employeeIdByCode = new Map(
    employees.map((employee) => [employee.employeeCode, employee._id as Types.ObjectId]),
  );
  const unmatchedEmployeeCodes = codes.filter((code) => !employeeIdByCode.has(code)).sort();

  const usage = await LeaveRequest.aggregate<{
    _id: { employeeId: Types.ObjectId; leaveType: string };
    total: number;
  }>([
    {
      $match: {
        employeeId: { $in: [...employeeIdByCode.values()] },
        startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
        status: { $in: ['pending_manager', 'pending_hr', 'approved'] },
      },
    },
    {
      $group: {
        _id: { employeeId: '$employeeId', leaveType: '$leaveType' },
        total: { $sum: '$requestedDays' },
      },
    },
  ]).exec();
  const usedDays = new Map(
    usage.map((row) => [`${String(row._id.employeeId)}\u001f${row._id.leaveType}`, row.total]),
  );

  const note = `Imported from ${input.fileName}${parsed.asOfLabel ? ` (${parsed.asOfLabel})` : ''}`
    .replace(/\s+/g, ' ')
    .slice(0, 500);
  const updatedByUserId = new Types.ObjectId(input.importedBy);
  const operations = parsed.entries.flatMap((entry) => {
    const employeeId = employeeIdByCode.get(entry.employeeCode);
    if (!employeeId) return [];
    // Offset leave already pending/approved in the app so `available` equals the sheet.
    const total = entry.days + (usedDays.get(`${String(employeeId)}\u001f${entry.leaveType}`) ?? 0);
    return [
      {
        updateOne: {
          filter: { employeeId, leaveType: entry.leaveType, year },
          update: {
            $set: {
              entitledDays: Math.max(total, 0),
              adjustedDays: Math.min(total, 0),
              note,
              updatedByUserId,
            },
          },
          upsert: true,
        },
      },
    ];
  });

  if (operations.length > 0) await LeaveBalance.bulkWrite(operations, { ordered: false });

  const updatedEmployees = new Set(
    parsed.entries
      .filter((entry) => employeeIdByCode.has(entry.employeeCode))
      .map((entry) => entry.employeeCode),
  );

  return {
    fileName: input.fileName,
    format: parsed.format,
    year,
    asOfLabel: parsed.asOfLabel,
    totalRows: parsed.totalRows,
    employeesUpdated: updatedEmployees.size,
    balancesWritten: operations.length,
    ignoredLeaveTypes: parsed.ignoredLeaveTypes,
    unmatchedEmployeeCodes,
    errors: parsed.errors,
  };
}
