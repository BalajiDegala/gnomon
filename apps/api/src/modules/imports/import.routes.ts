import { AttendanceImportSourceSchema } from '@gnomon/shared';
import { Router, text } from 'express';
import { z } from 'zod';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/errors.js';
import { importAttendanceCsv, listImportBatches } from './attendance-import.service.js';

const ImportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function readFileName(header: string | undefined, source: string): string {
  if (!header) return `${source}.csv`;
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

importRouter.post(
  '/attendance/:source/csv',
  text({ type: ['text/csv', 'application/csv', 'text/plain'], limit: '5mb' }),
  async (request, response) => {
    const source = AttendanceImportSourceSchema.parse(request.params.source);
    if (typeof request.body !== 'string' || request.body.trim().length === 0) {
      throw new HttpError(400, 'A non-empty CSV file is required', 'CSV_REQUIRED');
    }

    const result = await importAttendanceCsv({
      source,
      fileName: readFileName(request.get('x-file-name'), source),
      csvText: request.body,
      importedBy: request.authUser!.id,
    });
    response.status(result.replayed ? 200 : 201).json(result);
  },
);
