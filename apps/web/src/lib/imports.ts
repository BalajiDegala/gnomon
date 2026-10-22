import type {
  AttendanceImportResponse,
  AttendanceImportSource,
  ImportBatchDto,
  AttendanceChangePreview,
  AttendanceChangeResponse,
  AttendanceChangeConfirmation,
  AttendanceReplacementPeriod,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface ImportHistoryResponse {
  batches: ImportBatchDto[];
}

export type AttendanceUploadFormat = AttendanceImportSource | 'door_workbook';

export type AttendanceChangeInput =
  | { kind: 'delete'; batchId: string; fileName: string }
  | {
      kind: 'replace';
      format: AttendanceUploadFormat;
      file: File;
      period: AttendanceReplacementPeriod;
    };

export function useAttendanceImports() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canImport =
    user?.grants.some(
      (grant) => grant.permissions.includes('imports:create') && grant.scope.type === 'company',
    ) ?? false;

  const refreshAttendance = async () => {
    await Promise.all(
      [
        'attendance-imports',
        'timecard',
        'attendance-details',
        'calendar',
        'managed-calendar',
        'reports',
        'employees',
        'security',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };

  async function changeRequest<T>(
    input: AttendanceChangeInput,
    confirmation?: AttendanceChangeConfirmation,
  ): Promise<T> {
    if (input.kind === 'delete') {
      return request<T>(
        `/api/v1/imports/${input.batchId}${confirmation ? '' : '/delete-preview'}`,
        {
          method: confirmation ? 'DELETE' : 'GET',
          ...(confirmation ? { body: JSON.stringify(confirmation) } : {}),
        },
      );
    }
    const workbook = input.format === 'door_workbook';
    const path = workbook ? 'access-card/door-workbook' : `${input.format}/csv`;
    const query = new URLSearchParams({
      ...input.period,
      mode: confirmation ? 'replace' : 'replacement-preview',
    });
    return request<T>(`/api/v1/imports/attendance/${path}?${query}`, {
      method: 'POST',
      headers: {
        'content-type': workbook ? 'application/octet-stream' : 'text/csv; charset=utf-8',
        'x-file-name': encodeURIComponent(input.file.name),
        ...(confirmation
          ? {
              'x-preview-token': confirmation.previewToken,
              'x-change-reason': encodeURIComponent(confirmation.reason),
            }
          : {}),
      },
      body: workbook ? await input.file.arrayBuffer() : await input.file.text(),
    });
  }

  const previewChange = useMutation({
    mutationFn: (input: AttendanceChangeInput) => changeRequest<AttendanceChangePreview>(input),
  });
  const applyChange = useMutation({
    mutationFn: ({
      input,
      confirmation,
    }: {
      input: AttendanceChangeInput;
      confirmation: AttendanceChangeConfirmation;
    }) => changeRequest<AttendanceChangeResponse>(input, confirmation),
    onSuccess: refreshAttendance,
  });

  const history = useQuery({
    queryKey: ['attendance-imports'],
    queryFn: () => request<ImportHistoryResponse>('/api/v1/imports?limit=20'),
    enabled: canImport,
  });

  const upload = useMutation({
    onMutate: () => {
      applyChange.reset();
      previewChange.reset();
    },
    mutationFn: async ({ format, file }: { format: AttendanceUploadFormat; file: File }) => {
      const isDoorWorkbook = format === 'door_workbook';
      return request<AttendanceImportResponse>(
        isDoorWorkbook
          ? '/api/v1/imports/attendance/access-card/door-workbook'
          : `/api/v1/imports/attendance/${format}/csv`,
        {
          method: 'POST',
          headers: {
            'content-type': isDoorWorkbook
              ? file.type || 'application/vnd.ms-excel'
              : 'text/csv; charset=utf-8',
            'x-file-name': encodeURIComponent(file.name),
          },
          body: isDoorWorkbook ? await file.arrayBuffer() : await file.text(),
        },
      );
    },
    onSuccess: refreshAttendance,
  });

  return {
    canImport,
    batches: history.data?.batches ?? [],
    historyError: history.error,
    isHistoryLoading: history.isLoading,
    result: upload.data,
    uploadError: upload.error,
    isUploading: upload.isPending,
    upload: (format: AttendanceUploadFormat, file: File) => upload.mutateAsync({ format, file }),
    previewChange: (input: AttendanceChangeInput) => {
      applyChange.reset();
      return previewChange.mutateAsync(input);
    },
    applyChange: (input: AttendanceChangeInput, confirmation: AttendanceChangeConfirmation) =>
      applyChange.mutateAsync({ input, confirmation }),
    isPreviewing: previewChange.isPending,
    isChanging: applyChange.isPending,
    changeError: previewChange.error ?? applyChange.error,
    changeResult: applyChange.data,
  };
}

export function downloadAttendanceTemplate(source: AttendanceImportSource): void {
  const eventTypes = source === 'biometric' ? ['in', 'out'] : ['entry', 'exit'];
  const rows = [
    'employee_code,occurred_at,event_type,source_event_id,device_id,device_name',
    `DDI0001,2026-07-27 09:00:00,${eventTypes[0]},EVENT-001,DEVICE-01,Main gate`,
    `DDI0001,2026-07-27 18:00:00,${eventTypes[1]},EVENT-002,DEVICE-01,Main gate`,
  ];
  const url = URL.createObjectURL(new Blob([`${rows.join('\n')}\n`], { type: 'text/csv' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${source.replace('_', '-')}-attendance-template.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
