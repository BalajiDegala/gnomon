import { z } from 'zod';

export const AttendanceImportSourceSchema = z.enum(['biometric', 'access_card']);
export type AttendanceImportSource = z.infer<typeof AttendanceImportSourceSchema>;

export const AttendanceImportStatusSchema = z.enum([
  'processing',
  'completed',
  'partial',
  'failed',
  'deleted',
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
  removedRows: z.number().int().nonnegative().default(0),
  removedAt: z.string().datetime().nullable().default(null),
  removalReason: z.string().nullable().default(null),
});
export type ImportBatchDto = z.infer<typeof ImportBatchDtoSchema>;

export const AttendanceImportResponseSchema = z.object({
  batch: ImportBatchDtoSchema,
  replayed: z.boolean(),
});
export type AttendanceImportResponse = z.infer<typeof AttendanceImportResponseSchema>;

export const AttendanceReplacementPeriodSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine(({ from, to }) => from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000, {
    message: 'Choose a valid work-date range of at most 367 days',
  });
export type AttendanceReplacementPeriod = z.infer<typeof AttendanceReplacementPeriodSchema>;

export const AttendanceChangeConfirmationSchema = z.object({
  previewToken: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(5).max(500),
});
export type AttendanceChangeConfirmation = z.infer<typeof AttendanceChangeConfirmationSchema>;

export interface AttendanceChangePreview {
  previewToken: string;
  source: AttendanceImportSource;
  existingEvents: number;
  existingEmployees: number;
  existingWorkdays: number;
  replacementEvents: number;
}

export interface AttendanceChangeResponse {
  removedEvents: number;
  reconciledTimecards: number;
  batch: ImportBatchDto | null;
}

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
