import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmployeeAuditEvent } from '../src/modules/employees/employee-audit.model.js';
import { Employee } from '../src/modules/employees/employee.model.js';
import { provisionWorkbookEmployees } from '../src/modules/imports/attendance-import.service.js';
import type { ParsedAttendanceFile } from '../src/modules/imports/attendance-import.parser.js';

function queryResult<T>(value: T) {
  const query = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  query.select.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

function parsedProfile(employeeCode: string): ParsedAttendanceFile {
  return {
    totalRows: 1,
    ignoredRows: 0,
    rows: [],
    errors: [],
    employeeProfiles: [
      {
        employeeCode,
        firstName: 'Abhishek',
        lastName: 'Donikena',
        departmentName: 'Production',
        cardNumber: 'CARD-667',
        lastSeenAt: new Date('2026-06-30T13:50:27.000Z'),
      },
    ],
  };
}

describe('provisionWorkbookEmployees', () => {
  afterEach(() => vi.restoreAllMocks());

  it('updates the matching directory employee instead of creating a door duplicate', async () => {
    const employeeId = new Types.ObjectId();
    const find = vi.spyOn(Employee, 'find');
    find.mockReturnValue(
      queryResult([
        {
          _id: employeeId,
          employeeCode: 'DDIH667',
          firstName: 'Abhishek',
          lastName: 'Donikena',
          attendanceIdentity: null,
          profileSource: 'users_csv',
          hrProfile: { fullName: 'Abhishek Donikena' },
        },
      ]) as never,
    );
    const bulkWrite = vi.spyOn(Employee, 'bulkWrite').mockResolvedValue({} as never);
    const audit = vi.spyOn(EmployeeAuditEvent, 'insertMany').mockResolvedValue([] as never);

    const created = await provisionWorkbookEmployees(
      parsedProfile('667'),
      new Types.ObjectId().toString(),
    );

    expect(created).toBe(0);
    expect(bulkWrite).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          updateOne: expect.objectContaining({ filter: { _id: employeeId } }),
        }),
      ],
      { ordered: false },
    );
    expect(audit).not.toHaveBeenCalled();
  });

  it('creates and audits an unmatched door profile', async () => {
    const createdEmployeeId = new Types.ObjectId();
    const find = vi.spyOn(Employee, 'find');
    find
      .mockReturnValueOnce(queryResult([]) as never)
      .mockReturnValueOnce(
        queryResult([{ _id: createdEmployeeId, employeeCode: '667', status: 'active' }]) as never,
      );
    const bulkWrite = vi.spyOn(Employee, 'bulkWrite').mockResolvedValue({} as never);
    const audit = vi.spyOn(EmployeeAuditEvent, 'insertMany').mockResolvedValue([] as never);

    const created = await provisionWorkbookEmployees(
      parsedProfile('667'),
      new Types.ObjectId().toString(),
    );

    expect(created).toBe(1);
    expect(bulkWrite).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(
      [expect.objectContaining({ employeeId: createdEmployeeId, action: 'created' })],
      { ordered: false },
    );
  });
});
