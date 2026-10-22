import { createHash } from 'node:crypto';

import {
  AttendanceChangeConfirmationSchema,
  AttendanceReplacementPeriodSchema,
  getWorkDate,
  type AttendanceChangeConfirmation,
  type AttendanceChangePreview,
  type AttendanceChangeResponse,
  type AttendanceReplacementPeriod,
} from '@gnomon/shared';
import { Types, type QueryFilter } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import {
  AttendanceEvent,
  type AttendanceEventDocument,
} from '../attendance/attendance-event.model.js';
import { reconcileDailyTimecard } from '../reconciliation/reconciliation.service.js';
import { AttendanceImportChange } from './attendance-import-change.model.js';
import {
  importAttendanceFile,
  resolveAttendanceRows,
  type AttendanceFileImportInput,
} from './attendance-import.service.js';
import { ImportBatch } from './import-batch.model.js';
import { withAttendanceWriteLock } from './attendance-write-lock.js';

type ReplacementInput = AttendanceFileImportInput & { period: AttendanceReplacementPeriod };
type EventFilter = QueryFilter<AttendanceEventDocument>;
type SelectedEvent = Pick<
  AttendanceEventDocument,
  '_id' | 'employeeId' | 'workDate' | 'importBatchId' | 'fingerprint'
>;
const activeEvents = { removedAt: null, isSynthetic: { $ne: true } };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

async function selectEvents(filter: EventFilter): Promise<SelectedEvent[]> {
  return AttendanceEvent.find({ ...filter, ...activeEvents })
    .select({ _id: 1, employeeId: 1, workDate: 1, importBatchId: 1, fingerprint: 1 })
    .sort({ _id: 1 })
    .lean()
    .exec();
}

function preview(
  events: SelectedEvent[],
  source: AttendanceChangePreview['source'],
  replacementEvents: number,
  identity: unknown,
): AttendanceChangePreview {
  return {
    previewToken: hash(JSON.stringify({ identity, events })),
    source,
    existingEvents: events.length,
    existingEmployees: new Set(events.map((event) => String(event.employeeId))).size,
    existingWorkdays: new Set(events.map((event) => `${event.employeeId}:${event.workDate}`)).size,
    replacementEvents,
  };
}

async function deletion(batchId: string) {
  if (!Types.ObjectId.isValid(batchId))
    throw new HttpError(400, 'Invalid import identifier', 'INVALID_IMPORT');
  const batch = await ImportBatch.findById(batchId).exec();
  if (!batch) throw new HttpError(404, 'Import not found', 'IMPORT_NOT_FOUND');
  if (batch.status === 'processing' || batch.status === 'deleted') {
    throw new HttpError(
      409,
      'This import is processing or has already been deleted',
      'IMPORT_NOT_DELETABLE',
    );
  }
  const events = await selectEvents({ importBatchId: batch._id });
  return {
    batch,
    events,
    preview: preview(events, batch.source, 0, { batchId, updatedAt: batch.updatedAt }),
  };
}

async function replacement(input: ReplacementInput) {
  const period = AttendanceReplacementPeriodSchema.parse(input.period);
  if (period.to > getWorkDate(new Date()))
    throw new HttpError(
      400,
      'The replacement period cannot include future work dates',
      'FUTURE_WORK_DATE',
    );
  const parsed = await input.parse();
  if (parsed.errors.length > 0 || parsed.totalRows === 0) {
    const detail = parsed.errors
      .slice(0, 3)
      .map((error) => `Row ${error.rowNumber}: ${error.reason}`)
      .join('; ');
    throw new HttpError(
      400,
      detail || 'The replacement file contains no data rows',
      'REPLACEMENT_INVALID',
    );
  }
  if (
    parsed.rows.some((row) => {
      const date = row.workDate ?? getWorkDate(row.occurredAt);
      return date < period.from || date > period.to;
    })
  )
    throw new HttpError(
      400,
      'Every punch in the replacement file must be within the selected work-date range',
      'REPLACEMENT_OUTSIDE_PERIOD',
    );

  const resolved = await resolveAttendanceRows(parsed, input.source);
  const workbookCodes = new Set(parsed.employeeProfiles.map((profile) => profile.employeeCode));
  const provisionableCodes = new Set([
    ...workbookCodes,
    ...resolved.provisionableEmployees.map((profile) => profile.employeeCode),
  ]);
  const unresolved = resolved.errors.filter((error) => !provisionableCodes.has(error.employeeCode));
  if (unresolved.length > 0) {
    throw new HttpError(
      400,
      unresolved
        .slice(0, 3)
        .map((error) => `Row ${error.rowNumber}: ${error.reason}`)
        .join('; '),
      'REPLACEMENT_INVALID',
    );
  }
  const events = await selectEvents({
    source: input.source,
    workDate: { $gte: period.from, $lte: period.to },
  });
  const fileHash = hash(input.fileContent);
  return {
    parsed,
    events,
    fileHash,
    period,
    preview: preview(events, input.source, parsed.rows.length, {
      source: input.source,
      type: input.importType,
      fileHash,
      period,
      employees: [...resolved.employeeIds.entries()].sort(([a], [b]) => a.localeCompare(b)),
      provisionableEmployees: resolved.provisionableEmployees,
    }),
  };
}

export async function previewImportDeletion(batchId: string) {
  return (await deletion(batchId)).preview;
}

export async function previewAttendanceReplacement(input: ReplacementInput) {
  return (await replacement(input)).preview;
}

function requireFreshPreview(
  current: AttendanceChangePreview,
  confirmation: AttendanceChangeConfirmation,
) {
  if (current.previewToken !== confirmation.previewToken) {
    throw new HttpError(
      409,
      'The attendance data has changed. Review a new preview before confirming.',
      'IMPORT_PREVIEW_STALE',
    );
  }
}

async function recalculate(events: Pick<SelectedEvent, 'employeeId' | 'workDate'>[]) {
  const today = getWorkDate(new Date());
  const dates = new Map(
    events
      .filter((event) => event.workDate <= today)
      .map((event) => [`${event.employeeId}:${event.workDate}`, event]),
  );
  const pending = [...dates.values()];
  // Wait for all workers even on error, so rollback cannot race a stale calculation.
  let next = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(12, pending.length) }, async () => {
      while (next < pending.length) {
        const event = pending[next++]!;
        await reconcileDailyTimecard(String(event.employeeId), event.workDate);
      }
    }),
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return dates.size;
}

async function retire(
  filter: EventFilter,
  changeId: Types.ObjectId,
  actorId: string,
  reason: string,
) {
  await AttendanceEvent.updateMany(
    { ...filter, removedAt: null },
    [
      {
        $set: {
          originalFingerprint: '$fingerprint',
          fingerprint: { $concat: ['$fingerprint', `:removed:${changeId}`] },
          removedAt: '$$NOW',
          removedBy: { $literal: new Types.ObjectId(actorId) },
          removalReason: { $literal: reason },
          removalChangeId: { $literal: changeId },
        },
      },
    ],
    { updatePipeline: true },
  ).exec();
}

async function applyChange(input: {
  action: 'delete' | 'replace';
  events: SelectedEvent[];
  source: AttendanceChangePreview['source'];
  actorId: string;
  reason: string;
  batchId?: Types.ObjectId;
  replacement?: ReplacementInput;
  parsed?: Awaited<ReturnType<ReplacementInput['parse']>>;
  fileHash?: string;
}): Promise<AttendanceChangeResponse> {
  const batchIds = [...new Set(input.events.map((event) => String(event.importBatchId)))];
  if (input.batchId) batchIds.push(String(input.batchId));
  const workDates = input.events.map((event) => event.workDate).sort();
  const from = input.replacement?.period.from ?? workDates[0];
  const to = input.replacement?.period.to ?? workDates.at(-1);
  // Duplicate-only batches have no owned events. Invalidate overlapping file
  // replays too, otherwise an exact re-upload could incorrectly skip missing data.
  // The extra day covers source reports that explicitly assign overnight punches.
  const overlappingBatches =
    from && to
      ? [
          {
            source: input.source,
            fileHash: /^[a-f0-9]{64}$/,
            periodStart: { $lte: new Date(Date.parse(to) + 2 * 86400000) },
            periodEnd: { $gte: new Date(Date.parse(from) - 86400000) },
          },
        ]
      : [];
  const previousBatches = await ImportBatch.find({
    $or: [
      { _id: { $in: batchIds } },
      ...(input.fileHash ? [{ source: input.source, fileHash: input.fileHash }] : []),
      ...overlappingBatches,
    ],
  })
    .select({ fileHash: 1, status: 1, removedRows: 1, removedAt: 1, removalReason: 1 })
    .lean()
    .exec();
  const change = await AttendanceImportChange.create({
    action: input.action,
    source: input.source,
    batchId: input.batchId,
    from: input.replacement?.period.from,
    to: input.replacement?.period.to,
    actorId: input.actorId,
    reason: input.reason,
    removedEvents: input.events.length,
    previousBatches,
  });
  try {
    await retire(
      { _id: { $in: input.events.map((event) => event._id) } },
      change._id,
      input.actorId,
      input.reason,
    );
    // Release the original file hashes so an intentionally re-uploaded file can run again.
    for (const batch of previousBatches) {
      const removedRows = input.events.filter((event) =>
        event.importBatchId.equals(batch._id),
      ).length;
      const deletingBatch = input.action === 'delete' && batch._id.equals(input.batchId!);
      await ImportBatch.updateOne(
        { _id: batch._id },
        {
          $set: {
            fileHash: `${batch.fileHash}:removed:${change._id}`,
            ...(removedRows > 0 || deletingBatch
              ? { removedAt: new Date(), removalReason: input.reason }
              : {}),
            ...(deletingBatch ? { status: 'deleted' } : {}),
          },
          $inc: { removedRows },
        },
      ).exec();
    }
    const imported =
      input.replacement && input.parsed
        ? await importAttendanceFile({
            ...input.replacement,
            changeId: change._id,
            parse: () => input.parsed!,
          })
        : null;
    const inserted = imported ? await selectEvents({ importBatchId: imported.batch.id }) : [];
    const reconciledTimecards = await recalculate([...input.events, ...inserted]);
    change.set({ status: 'completed', replacementBatchId: imported?.batch.id ?? null });
    await change.save();
    return {
      removedEvents: input.events.length,
      reconciledTimecards,
      batch: imported?.batch ?? null,
    };
  } catch (error) {
    try {
      await restoreAttendanceChange(String(change._id));
    } catch {
      await AttendanceImportChange.updateOne(
        { _id: change._id },
        { $set: { status: 'recovery_required' } },
      )
        .exec()
        .catch(() => {});
      throw new HttpError(
        503,
        'This attendance change needs recovery. Further imports are paused; contact the system administrator.',
        'ATTENDANCE_RECOVERY_REQUIRED',
      );
    }
    throw error;
  }
}

export async function deleteAttendanceImport(
  batchId: string,
  actorId: string,
  confirmation: AttendanceChangeConfirmation,
) {
  confirmation = AttendanceChangeConfirmationSchema.parse(confirmation);
  return withAttendanceWriteLock(async () => {
    const prepared = await deletion(batchId);
    requireFreshPreview(prepared.preview, confirmation);
    return applyChange({
      action: 'delete',
      events: prepared.events,
      source: prepared.batch.source,
      actorId,
      reason: confirmation.reason,
      batchId: prepared.batch._id,
    });
  });
}

export async function replaceAttendancePeriod(
  input: ReplacementInput,
  confirmation: AttendanceChangeConfirmation,
) {
  confirmation = AttendanceChangeConfirmationSchema.parse(confirmation);
  return withAttendanceWriteLock(async () => {
    const prepared = await replacement(input);
    requireFreshPreview(prepared.preview, confirmation);
    return applyChange({
      action: 'replace',
      events: prepared.events,
      source: input.source,
      actorId: input.importedBy,
      reason: confirmation.reason,
      replacement: input,
      parsed: prepared.parsed,
      fileHash: prepared.fileHash,
    });
  });
}

/** Restore an interrupted change while its attendance write lock remains held. */
export async function restoreAttendanceChange(changeId: string): Promise<void> {
  const change = await AttendanceImportChange.findById(changeId).orFail().exec();
  if (!['applying', 'recovery_required'].includes(change.status)) {
    throw new HttpError(
      409,
      'Only an interrupted change can be recovered',
      'CHANGE_NOT_RECOVERABLE',
    );
  }
  const originalEvents = await AttendanceEvent.find({ removalChangeId: change._id })
    .select({ employeeId: 1, workDate: 1 })
    .lean()
    .exec();
  const newBatches = await ImportBatch.find({ changeId: change._id })
    .select({ _id: 1 })
    .lean()
    .exec();
  const newBatchIds = newBatches.map((batch) => batch._id);
  const addedEvents = await AttendanceEvent.find({ importBatchId: { $in: newBatchIds } })
    .select({ employeeId: 1, workDate: 1 })
    .lean()
    .exec();
  await retire(
    { importBatchId: { $in: newBatchIds } },
    new Types.ObjectId(),
    String(change.actorId),
    'Replacement rolled back',
  );
  await ImportBatch.updateMany(
    { _id: { $in: newBatchIds } },
    [
      {
        $set: {
          status: 'failed',
          fileHash: { $concat: ['$fileHash', `:rolled-back:${change._id}`] },
          removedAt: '$$NOW',
          removalReason: 'Replacement rolled back',
        },
      },
    ],
    { updatePipeline: true },
  ).exec();
  await AttendanceEvent.updateMany(
    { removalChangeId: change._id, removedAt: { $ne: null } },
    [
      {
        $set: {
          fingerprint: '$originalFingerprint',
          originalFingerprint: null,
          removedAt: null,
          removedBy: null,
          removalReason: null,
        },
      },
    ],
    { updatePipeline: true },
  ).exec();
  for (const batch of change.previousBatches) {
    await ImportBatch.updateOne(
      { _id: batch._id },
      {
        $set: {
          fileHash: batch.fileHash,
          status: batch.status,
          removedRows: batch.removedRows ?? 0,
          removedAt: batch.removedAt ?? null,
          removalReason: batch.removalReason ?? null,
        },
      },
    ).exec();
  }
  await recalculate([...originalEvents, ...addedEvents]);
  change.status = 'rolled_back';
  await change.save();
}
