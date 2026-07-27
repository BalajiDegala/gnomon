import { createHash } from 'node:crypto';

import type {
  AttendanceImportErrorDto,
  AttendanceImportResponse,
  AttendanceImportSource,
  ImportBatchDto,
} from '@gnomon/shared';
import { getWorkDate } from '@gnomon/shared';
import { Types } from 'mongoose';

import { AttendanceEvent } from '../attendance/attendance-event.model.js';
import { Employee } from '../employees/employee.model.js';
import { parseAttendanceCsv } from './attendance-import.parser.js';
import { ImportBatch, type ImportBatchRecord } from './import-batch.model.js';

const MAX_STORED_ERRORS = 500;
let indexesReady: Promise<unknown> | null = null;

function ensureImportIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([AttendanceEvent.createIndexes(), ImportBatch.createIndexes()]);
  return indexesReady;
}

function sha256(value: string): string {
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

export async function importAttendanceCsv(input: {
  source: AttendanceImportSource;
  fileName: string;
  csvText: string;
  importedBy: string;
}): Promise<AttendanceImportResponse> {
  await ensureImportIndexes();
  const fileHash = sha256(input.csvText);
  const existingBatch = await ImportBatch.findOne({ source: input.source, fileHash }).exec();
  if (existingBatch) return { batch: toImportBatchDto(existingBatch), replayed: true };

  let batch: ImportBatchRecord;
  try {
    batch = await ImportBatch.create({
      source: input.source,
      importType: 'csv',
      fileName: input.fileName.trim().slice(0, 255) || `${input.source}.csv`,
      fileHash,
      importedBy: new Types.ObjectId(input.importedBy),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const concurrentBatch = await ImportBatch.findOne({ source: input.source, fileHash }).exec();
    if (!concurrentBatch) throw error;
    return { batch: toImportBatchDto(concurrentBatch), replayed: true };
  }

  try {
    const parsed = parseAttendanceCsv(input.csvText, input.source);
    const employeeCodes = [...new Set(parsed.rows.map((row) => row.employeeCode))];
    const employees = await Employee.find({
      employeeCode: { $in: employeeCodes },
      status: 'active',
    })
      .select({ _id: 1, employeeCode: 1 })
      .lean()
      .exec();
    const employeeIds = new Map(employees.map((employee) => [employee.employeeCode, employee._id]));
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
              workDate: getWorkDate(row.occurredAt),
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
    const fatalFileError =
      parsed.rows.length === 0 && parsed.errors.some((error) => error.rowNumber === 1);
    const failedRows = fatalFileError
      ? parsed.totalRows
      : parsed.errors.length + (parsed.rows.length - acceptedRows.length);
    const instants = parsed.rows.map((row) => row.occurredAt.getTime());
    const storedErrors = errors.slice(0, MAX_STORED_ERRORS);

    batch.set({
      periodStart: instants.length > 0 ? new Date(Math.min(...instants)) : null,
      periodEnd: instants.length > 0 ? new Date(Math.max(...instants)) : null,
      totalRows: parsed.totalRows,
      successfulRows,
      failedRows,
      duplicateRows,
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

export async function listImportBatches(limit = 20): Promise<ImportBatchDto[]> {
  const batches = await ImportBatch.find().sort({ createdAt: -1 }).limit(limit).exec();
  return batches.map(toImportBatchDto);
}
