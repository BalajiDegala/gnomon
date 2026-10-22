import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttendanceEvent } from '../src/modules/attendance/attendance-event.model.js';
import { EmployeeAuditEvent } from '../src/modules/employees/employee-audit.model.js';
import { Employee } from '../src/modules/employees/employee.model.js';
import {
  importAttendanceCsv,
  provisionWorkbookEmployees,
} from '../src/modules/imports/attendance-import.service.js';
import type { ParsedAttendanceFile } from '../src/modules/imports/attendance-import.parser.js';
import { ImportBatch } from '../src/modules/imports/import-batch.model.js';

vi.mock('../src/modules/reconciliation/reconciliation.service.js', () => ({
  reconcileDailyTimecard: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/imports/attendance-write-lock.js', () => ({
  withAttendanceWriteLock: (action: () => Promise<unknown>) => action(),
}));

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

describe('attendance identity resolution', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['DDIH054', 'CARD-54'])(
    'preserves the exact %s match when a numeric candidate belongs to another employee',
    async (sourceCode) => {
      const employeeId = new Types.ObjectId();
      const actorId = new Types.ObjectId();
      vi.spyOn(AttendanceEvent, 'createIndexes').mockResolvedValue(undefined);
      vi.spyOn(ImportBatch, 'createIndexes').mockResolvedValue(undefined);
      vi.spyOn(ImportBatch, 'findOne').mockReturnValue(queryResult(null) as never);
      const batch = new ImportBatch({
        source: 'biometric',
        importType: 'csv',
        fileName: 'biometric.csv',
        fileHash: 'test',
        importedBy: actorId,
        createdAt: new Date(),
      });
      vi.spyOn(batch, 'save').mockResolvedValue(batch);
      vi.spyOn(ImportBatch, 'create').mockResolvedValue(batch as never);
      vi.spyOn(Employee, 'find').mockReturnValue(
        queryResult([
          {
            _id: employeeId,
            employeeCode: 'DDIH054',
            firstName: 'Correct',
            lastName: 'Employee',
            attendanceIdentity: { personnelId: 'CARD-54' },
          },
          {
            _id: new Types.ObjectId(),
            employeeCode: '9054',
            firstName: 'Different',
            lastName: 'Employee',
            attendanceIdentity: { personnelId: '9054' },
          },
        ]) as never,
      );
      const write = vi.spyOn(AttendanceEvent, 'bulkWrite').mockResolvedValue({
        upsertedCount: 1,
      } as never);

      const result = await importAttendanceCsv({
        source: 'biometric',
        fileName: 'biometric.csv',
        importedBy: actorId.toString(),
        csvText: `employee_code,occurred_at,event_type\n${sourceCode},2026-06-01 09:00:00,in`,
      });

      expect(result.batch.successfulRows).toBe(1);
      expect(write).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            updateOne: expect.objectContaining({
              update: expect.objectContaining({
                $setOnInsert: expect.objectContaining({ employeeId }),
              }),
            }),
          }),
        ],
        { ordered: false },
      );
    },
  );
});
