import { createHash } from 'node:crypto';

import type {
  AttendanceImportErrorDto,
  AttendanceImportResponse,
  AttendanceImportSource,
  AttendanceImportType,
  ImportBatchDto,
} from '@gnomon/shared';
import { getWorkDate } from '@gnomon/shared';
import { Types } from 'mongoose';

import { AttendanceEvent } from '../attendance/attendance-event.model.js';
import { EmployeeAuditEvent } from '../employees/employee-audit.model.js';
import { Employee } from '../employees/employee.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { matchWorkbookEmployeeProfiles } from './attendance-employee-matcher.js';
import { parseAttendanceCsv, type ParsedAttendanceFile } from './attendance-import.parser.js';
import { parseDoorAttendanceWorkbook } from './door-attendance-workbook.parser.js';
import { ImportBatch, type ImportBatchRecord } from './import-batch.model.js';

const MAX_STORED_ERRORS = 500;
const RECONCILIATION_CONCURRENCY = 12;
let indexesReady: Promise<unknown> | null = null;

function ensureImportIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([AttendanceEvent.createIndexes(), ImportBatch.createIndexes()]);
  return indexesReady;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function eventFingerprint(
  source: AttendanceImportSource,
  employeeCode: string,
  eventType: string,
  occurredAt: Date,
  sourceEventId: string | null,
  deviceId: string | null,
): string {
  return sha256(
    [
      source,
      employeeCode,
      eventType,
      occurredAt.toISOString(),
      sourceEventId ?? '',
      deviceId ?? '',
    ].join('\u001f'),
  );
}

export function toImportBatchDto(batch: ImportBatchRecord): ImportBatchDto {
  return {
    id: String(batch._id),
    source: batch.source,
    importType: batch.importType,
    fileName: batch.fileName,
    periodStart: batch.periodStart?.toISOString() ?? null,
    periodEnd: batch.periodEnd?.toISOString() ?? null,
    totalRows: batch.totalRows,
    successfulRows: batch.successfulRows,
    failedRows: batch.failedRows,
    duplicateRows: batch.duplicateRows,
    ignoredRows: batch.ignoredRows ?? 0,
    provisionedEmployees: batch.provisionedEmployees ?? 0,
    reconciledTimecards: batch.reconciledTimecards ?? 0,
    status: batch.status,
    errors: batch.errors.map((error) => ({
      rowNumber: error.rowNumber,
      employeeCode: error.employeeCode,
      reason: error.reason,
    })),
    errorsTruncated: batch.errorsTruncated,
    createdAt: batch.createdAt.toISOString(),
  };
}

function resultStatus(successfulRows: number, duplicateRows: number, failedRows: number) {
  if (failedRows === 0) return 'completed' as const;
  if (successfulRows + duplicateRows > 0) return 'partial' as const;
  return 'failed' as const;
}

function importedEmployeeEmail(employeeCode: string): string {
  const slug =
    employeeCode
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 40) || 'personnel';
  return `attendance.${slug}.${sha256(employeeCode).slice(0, 10)}@gnomon.invalid`;
}

export async function provisionWorkbookEmployees(
  parsed: ParsedAttendanceFile,
  importedBy: string,
): Promise<number> {
  if (parsed.employeeProfiles.length === 0) return 0;

  const profiles = new Map(
    parsed.employeeProfiles.map((profile) => [profile.employeeCode, profile]),
  );
  const employeeCodes = [...profiles.keys()];
  const existing = await Employee.find({
    status: 'active',
    $or: [
      { employeeCode: { $in: employeeCodes } },
      { 'attendanceIdentity.personnelId': { $in: employeeCodes } },
      { profileSource: { $in: ['users_csv', 'manual'] } },
    ],
  })
    .select({
      employeeCode: 1,
      firstName: 1,
      lastName: 1,
      attendanceIdentity: 1,
      profileSource: 1,
      hrProfile: 1,
    })
    .lean()
    .exec();
  const { matchedEmployees, createdCodes } = matchWorkbookEmployeeProfiles(
    [...profiles.values()],
    existing,
  );

  await Employee.bulkWrite(
    [...profiles.values()].map((profile) => {
      const firstName =
        profile.firstName.trim().slice(0, 80) ||
        profile.lastName.trim().slice(0, 80) ||
        'Personnel';
      const lastName = profile.lastName.trim().slice(0, 80) || profile.employeeCode.slice(0, 80);
      const matchedEmployee = matchedEmployees.get(profile.employeeCode);
      return {
        updateOne: {
          filter: matchedEmployee
            ? { _id: matchedEmployee._id }
            : {
                $or: [
                  { employeeCode: profile.employeeCode },
                  { 'attendanceIdentity.personnelId': profile.employeeCode },
                ],
              },
          update: {
            $set: {
              attendanceIdentity: {
                source: 'door_workbook',
                personnelId: profile.employeeCode,
                cardNumber: profile.cardNumber,
                departmentName: profile.departmentName,
                lastSeenAt: profile.lastSeenAt,
              },
            },
            $setOnInsert: {
              employeeCode: profile.employeeCode,
              firstName,
              lastName,
              email: importedEmployeeEmail(profile.employeeCode),
              timezone: 'Asia/Kolkata',
              reportingManagerId: null,
              departmentId: null,
              locationId: null,
              profileSource: 'door_workbook',
              status: 'active',
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );

  if (createdCodes.length > 0) {
    const createdEmployees = await Employee.find({
      'attendanceIdentity.personnelId': { $in: createdCodes },
    })
      .select({ _id: 1, employeeCode: 1, status: 1 })
      .lean()
      .exec();
    await EmployeeAuditEvent.insertMany(
      createdEmployees.map((employee) => ({
        employeeId: employee._id,
        actorUserId: new Types.ObjectId(importedBy),
        action: 'created',
        changes: {
          employeeCode: employee.employeeCode,
          status: employee.status,
          source: 'door_workbook',
        },
      })),
      { ordered: false },
    );
  }

  return createdCodes.length;
}

async function reconcileImportedTimecards(
  rows: ParsedAttendanceFile['rows'],
  employeeIds: Map<string, Types.ObjectId>,
): Promise<number> {
  const timecards = new Map<string, { employeeId: string; workDate: string }>();
  rows.forEach((row) => {
    const employeeId = employeeIds.get(row.employeeCode);
    if (!employeeId) return;
    const workDate = row.workDate ?? getWorkDate(row.occurredAt);
    timecards.set(`${employeeId}\u001f${workDate}`, { employeeId: String(employeeId), workDate });
  });
  const pending = [...timecards.values()];
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(RECONCILIATION_CONCURRENCY, pending.length) },
    async () => {
      while (nextIndex < pending.length) {
        const timecard = pending[nextIndex++];
        if (timecard) await reconcileDailyTimecard(timecard.employeeId, timecard.workDate);
      }
    },
  );
  await Promise.all(workers);
  return pending.length;
}

interface AttendanceFileImportInput {
  source: AttendanceImportSource;
  importType: AttendanceImportType;
  fileName: string;
  fileContent: string | Buffer;
  importedBy: string;
  parse: () => ParsedAttendanceFile | Promise<ParsedAttendanceFile>;
}

async function importAttendanceFile(
  input: AttendanceFileImportInput,
): Promise<AttendanceImportResponse> {
  await ensureImportIndexes();
  const fileHash = sha256(input.fileContent);
  let parsedFile: ParsedAttendanceFile | null = null;
  const parseFile = async () => (parsedFile ??= await input.parse());
  const existingBatch = await ImportBatch.findOne({ source: input.source, fileHash }).exec();
  if (existingBatch?.status === 'completed') {
    if (input.importType === 'door_workbook') {
      const provisionedEmployees = await provisionWorkbookEmployees(
        await parseFile(),
        input.importedBy,
      );
      if (provisionedEmployees > 0) {
        existingBatch.provisionedEmployees =
          (existingBatch.provisionedEmployees ?? 0) + provisionedEmployees;
        await existingBatch.save();
      }
    }
    return { batch: toImportBatchDto(existingBatch), replayed: true };
  }

  let batch: ImportBatchRecord;
  if (existingBatch) {
    existingBatch.set({
      importType: input.importType,
      fileName: input.fileName.trim().slice(0, 255) || `${input.source}.csv`,
      periodStart: null,
      periodEnd: null,
      totalRows: 0,
      successfulRows: 0,
      failedRows: 0,
      duplicateRows: 0,
      ignoredRows: 0,
      provisionedEmployees: 0,
      reconciledTimecards: 0,
      status: 'processing',
      importedBy: new Types.ObjectId(input.importedBy),
      errors: [],
      errorsTruncated: false,
    });
    batch = await existingBatch.save();
  } else {
    try {
      batch = await ImportBatch.create({
        source: input.source,
        importType: input.importType,
        fileName: input.fileName.trim().slice(0, 255) || `${input.source}.csv`,
        fileHash,
        importedBy: new Types.ObjectId(input.importedBy),
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrentBatch = await ImportBatch.findOne({
        source: input.source,
        fileHash,
      }).exec();
      if (!concurrentBatch) throw error;
      return { batch: toImportBatchDto(concurrentBatch), replayed: true };
    }
  }

  try {
    const parsed = await parseFile();
    const provisionedEmployees = await provisionWorkbookEmployees(parsed, input.importedBy);
    const employeeCodes = [...new Set(parsed.rows.map((row) => row.employeeCode))];
    const employees = await Employee.find({
      status: 'active',
      $or: [
        { employeeCode: { $in: employeeCodes } },
        { 'attendanceIdentity.personnelId': { $in: employeeCodes } },
      ],
    })
      .select({ _id: 1, employeeCode: 1, attendanceIdentity: 1 })
      .lean()
      .exec();
    const employeeIds = new Map<string, Types.ObjectId>();
    for (const employee of employees) {
      employeeIds.set(employee.employeeCode, employee._id);
      if (employee.attendanceIdentity?.personnelId) {
        employeeIds.set(employee.attendanceIdentity.personnelId, employee._id);
      }
    }
    const errors: AttendanceImportErrorDto[] = [...parsed.errors];
    const acceptedRows = parsed.rows.filter((row) => {
      if (employeeIds.has(row.employeeCode)) return true;
      errors.push({
        rowNumber: row.rowNumber,
        employeeCode: row.employeeCode,
        reason: 'No active employee matches this employee code',
      });
      return false;
    });

    const uniqueRows = new Map<
      string,
      { row: (typeof acceptedRows)[number]; fingerprint: string }
    >();
    acceptedRows.forEach((row) => {
      const fingerprint = eventFingerprint(
        input.source,
        row.employeeCode,
        row.eventType,
        row.occurredAt,
        row.sourceEventId,
        row.deviceId,
      );

      if (!uniqueRows.has(fingerprint)) uniqueRows.set(fingerprint, { row, fingerprint });
    });

    const operations = [...uniqueRows.values()].map(({ row, fingerprint }) => {
      return {
        updateOne: {
          filter: { fingerprint },
          update: {
            $setOnInsert: {
              employeeId: employeeIds.get(row.employeeCode),
              source: input.source,
              eventType: row.eventType,
              occurredAt: row.occurredAt,
              workDate: row.workDate ?? getWorkDate(row.occurredAt),
              sourceEmployeeCode: row.employeeCode,
              sourceEventId: row.sourceEventId,
              importBatchId: batch._id,
              device: {
                deviceId: row.deviceId,
                deviceName: row.deviceName,
                locationId: null,
              },
              rawPayload: row.rawPayload,
              fingerprint,
              isSynthetic: false,
              correctionRequestId: null,
            },
          },
          upsert: true,
        },
      };
    });

    const writeResult =
      operations.length > 0
        ? await AttendanceEvent.bulkWrite(operations, { ordered: false })
        : { upsertedCount: 0 };
    const successfulRows = writeResult.upsertedCount;
    const duplicateRows = acceptedRows.length - successfulRows;
    const reconciledTimecards = await reconcileImportedTimecards(acceptedRows, employeeIds);
    const fatalFileError =
      parsed.rows.length === 0 && parsed.errors.some((error) => error.rowNumber === 1);
    const failedRows = fatalFileError ? parsed.totalRows : errors.length;
    const instants = parsed.rows.map((row) => row.occurredAt.getTime());
    const storedErrors = errors.slice(0, MAX_STORED_ERRORS);

    batch.set({
      periodStart: instants.length > 0 ? new Date(Math.min(...instants)) : null,
      periodEnd: instants.length > 0 ? new Date(Math.max(...instants)) : null,
      totalRows: parsed.totalRows,
      successfulRows,
      failedRows,
      duplicateRows,
      ignoredRows: parsed.ignoredRows,
      provisionedEmployees,
      reconciledTimecards,
      status: fatalFileError ? 'failed' : resultStatus(successfulRows, duplicateRows, failedRows),
      errors: storedErrors,
      errorsTruncated: errors.length > storedErrors.length,
    });
    await batch.save();

    return { batch: toImportBatchDto(batch), replayed: false };
  } catch (error) {
    batch.set({
      status: 'failed',
      errors: [
        {
          rowNumber: 1,
          employeeCode: '',
          reason: 'The import stopped because of an unexpected processing error',
        },
      ],
    });
    await batch.save();
    throw error;
  }
}

export async function importAttendanceCsv(input: {
  source: AttendanceImportSource;
  fileName: string;
  csvText: string;
  importedBy: string;
}): Promise<AttendanceImportResponse> {
  return importAttendanceFile({
    source: input.source,
    importType: 'csv',
    fileName: input.fileName,
    fileContent: input.csvText,
    importedBy: input.importedBy,
    parse: () => parseAttendanceCsv(input.csvText, input.source),
  });
}

export async function importDoorAttendanceWorkbook(input: {
  fileName: string;
  workbookBuffer: Buffer;
  importedBy: string;
}): Promise<AttendanceImportResponse> {
  return importAttendanceFile({
    source: 'access_card',
    importType: 'door_workbook',
    fileName: input.fileName,
    fileContent: input.workbookBuffer,
    importedBy: input.importedBy,
    parse: () => parseDoorAttendanceWorkbook(input.workbookBuffer),
  });
}

export async function listImportBatches(limit = 20): Promise<ImportBatchDto[]> {
  const batches = await ImportBatch.find().sort({ createdAt: -1 }).limit(limit).exec();
  return batches.map(toImportBatchDto);
}
