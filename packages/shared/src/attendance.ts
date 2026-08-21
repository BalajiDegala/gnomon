import { z } from 'zod';

export const AttendanceImportSourceSchema = z.enum(['biometric', 'access_card']);
export type AttendanceImportSource = z.infer<typeof AttendanceImportSourceSchema>;

export const AttendanceImportStatusSchema = z.enum([
  'processing',
  'completed',
  'partial',
  'failed',
]);
export type AttendanceImportStatus = z.infer<typeof AttendanceImportStatusSchema>;

export const AttendanceImportTypeSchema = z.enum(['csv', 'door_workbook']);
export type AttendanceImportType = z.infer<typeof AttendanceImportTypeSchema>;

export const AttendanceImportErrorDtoSchema = z.object({
  rowNumber: z.number().int().positive(),
  employeeCode: z.string(),
  reason: z.string(),
});
export type AttendanceImportErrorDto = z.infer<typeof AttendanceImportErrorDtoSchema>;

export const ImportBatchDtoSchema = z.object({
  id: z.string(),
  source: AttendanceImportSourceSchema,
  importType: AttendanceImportTypeSchema,
  fileName: z.string(),
  periodStart: z.string().datetime().nullable(),
  periodEnd: z.string().datetime().nullable(),
  totalRows: z.number().int().nonnegative(),
  successfulRows: z.number().int().nonnegative(),
  failedRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  ignoredRows: z.number().int().nonnegative(),
  provisionedEmployees: z.number().int().nonnegative(),
  reconciledTimecards: z.number().int().nonnegative(),
  status: AttendanceImportStatusSchema,
  errors: z.array(AttendanceImportErrorDtoSchema),
  errorsTruncated: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ImportBatchDto = z.infer<typeof ImportBatchDtoSchema>;

export const AttendanceImportResponseSchema = z.object({
  batch: ImportBatchDtoSchema,
  replayed: z.boolean(),
});
export type AttendanceImportResponse = z.infer<typeof AttendanceImportResponseSchema>;

export const AttendanceSignalDtoSchema = z.object({
  status: z.enum(['complete', 'incomplete', 'none']),
  firstEventAt: z.string().datetime().nullable(),
  lastEventAt: z.string().datetime().nullable(),
  eventCount: z.number().int().nonnegative(),
});
export type AttendanceSignalDto = z.infer<typeof AttendanceSignalDtoSchema>;

export const AttendanceSignalsDtoSchema = z.object({
  biometric: AttendanceSignalDtoSchema,
  accessCard: AttendanceSignalDtoSchema,
});
export type AttendanceSignalsDto = z.infer<typeof AttendanceSignalsDtoSchema>;
