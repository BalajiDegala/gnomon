import {
  AttendanceImportSourceSchema,
  AttendanceReplacementPeriodSchema,
  AttendanceChangeConfirmationSchema,
} from '@gnomon/shared';
import { raw, Router, text, type Request } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/errors.js';
import {
  importAttendanceCsv,
  importDoorAttendanceWorkbook,
  listImportBatches,
  type AttendanceFileImportInput,
} from './attendance-import.service.js';
import { parseAttendanceCsv } from './attendance-import.parser.js';
import { parseDoorAttendanceWorkbook } from './door-attendance-workbook.parser.js';
import {
  deleteAttendanceImport,
  previewImportDeletion,
  previewAttendanceReplacement,
  replaceAttendancePeriod,
} from './attendance-import-change.service.js';
import { importApprovalRoutesCsv } from './approval-route-import.service.js';
import { importUserDirectoryCsv } from './user-directory-import.service.js';

const ImportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function readFileName(header: string | undefined, fallbackFileName: string): string {
  if (!header) return fallbackFileName;
  try {
    return decodeURIComponent(header).replace(/[\\/]/g, '_');
  } catch {
    return header.replace(/[\\/]/g, '_');
  }
}

export const importRouter = Router();

importRouter.use(requireAuth, requirePermission('imports:create', ['company']));

importRouter.get('/', async (request, response) => {
  const { limit } = ImportListQuerySchema.parse(request.query);
  response.json({ batches: await listImportBatches(limit) });
});

importRouter.get('/:batchId/delete-preview', async (request, response) => {
  response.json(await previewImportDeletion(String(request.params.batchId)));
});

importRouter.delete('/:batchId', async (request, response) => {
  response.json(
    await deleteAttendanceImport(
      String(request.params.batchId),
      request.authUser!.id,
      AttendanceChangeConfirmationSchema.parse(request.body),
    ),
  );
});

async function replacementRequest(request: Request, input: AttendanceFileImportInput) {
  const period = AttendanceReplacementPeriodSchema.parse({
    from: request.query.from,
    to: request.query.to,
  });
  if (request.query.mode === 'replacement-preview')
    return previewAttendanceReplacement({ ...input, period });
  let reason: string;
  try {
    reason = decodeURIComponent(request.get('x-change-reason') ?? '');
  } catch {
    throw new HttpError(400, 'Invalid change reason', 'INVALID_REASON');
  }
  return replaceAttendancePeriod(
    { ...input, period },
    AttendanceChangeConfirmationSchema.parse({
      reason,
      previewToken: request.get('x-preview-token'),
    }),
  );
}

importRouter.post(
  '/users/csv',
  text({ type: ['text/csv', 'application/csv', 'text/plain'], limit: '2mb' }),
  async (request, response) => {
    if (typeof request.body !== 'string' || request.body.trim().length === 0) {
      throw new HttpError(400, 'A non-empty users CSV file is required', 'CSV_REQUIRED');
    }
    const result = await importUserDirectoryCsv({
      fileName: readFileName(request.get('x-file-name'), 'users.csv'),
      csvText: request.body,
      importedBy: request.authUser!.id,
    });
    response.status(result.importedRows > 0 ? 201 : 400).json(result);
  },
);

importRouter.post(
  '/approval-routes/csv',
  text({ type: ['text/csv', 'application/csv', 'text/plain'], limit: '1mb' }),
  async (request, response) => {
    if (typeof request.body !== 'string' || request.body.trim().length === 0) {
      throw new HttpError(400, 'A non-empty approvals CSV file is required', 'CSV_REQUIRED');
    }
    const result = await importApprovalRoutesCsv({
      fileName: readFileName(request.get('x-file-name'), 'approvals.csv'),
      csvText: request.body,
      importedBy: request.authUser!.id,
    });
    response.status(201).json(result);
  },
);

importRouter.post(
  '/attendance/:source/csv',
  text({ type: ['text/csv', 'application/csv', 'text/plain'], limit: '5mb' }),
  async (request, response) => {
    const source = AttendanceImportSourceSchema.parse(request.params.source);
    if (typeof request.body !== 'string' || request.body.trim().length === 0) {
      throw new HttpError(400, 'A non-empty CSV file is required', 'CSV_REQUIRED');
    }

    const mode = z
      .enum(['add', 'replacement-preview', 'replace'])
      .default('add')
      .parse(request.query.mode);
    if (mode !== 'add') {
      response.json(
        await replacementRequest(request, {
          source,
          importType: 'csv',
          fileContent: request.body,
          fileName: readFileName(request.get('x-file-name'), `${source}.csv`),
          importedBy: request.authUser!.id,
          parse: () => parseAttendanceCsv(request.body as string, source),
        }),
      );
      return;
    }

    const result = await importAttendanceCsv({
      source,
      fileName: readFileName(request.get('x-file-name'), `${source}.csv`),
      csvText: request.body,
      importedBy: request.authUser!.id,
    });
    response.status(result.replayed ? 200 : 201).json(result);
  },
);

importRouter.post(
  '/attendance/access-card/door-workbook',
  raw({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ],
    limit: '10mb',
  }),
  async (request, response) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new HttpError(400, 'A non-empty door workbook is required', 'WORKBOOK_REQUIRED');
    }

    const mode = z
      .enum(['add', 'replacement-preview', 'replace'])
      .default('add')
      .parse(request.query.mode);
    if (mode !== 'add') {
      response.json(
        await replacementRequest(request, {
          source: 'access_card',
          importType: 'door_workbook',
          fileContent: request.body,
          fileName: readFileName(request.get('x-file-name'), 'door-attendance.xls'),
          importedBy: request.authUser!.id,
          parse: () => parseDoorAttendanceWorkbook(request.body as Buffer),
        }),
      );
      return;
    }

    const result = await importDoorAttendanceWorkbook({
      fileName: readFileName(request.get('x-file-name'), 'door-attendance.xls'),
      workbookBuffer: request.body,
      importedBy: request.authUser!.id,
    });
    response.status(result.replayed ? 200 : 201).json(result);
  },
);
