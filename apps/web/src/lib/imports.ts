import type {
  AttendanceImportResponse,
  AttendanceImportSource,
  ImportBatchDto,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface ImportHistoryResponse {
  batches: ImportBatchDto[];
}

export type AttendanceUploadFormat = AttendanceImportSource | 'door_workbook';

export function useAttendanceImports() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canImport = user?.permissions.includes('imports:create') ?? false;

  const history = useQuery({
    queryKey: ['attendance-imports'],
    queryFn: () => request<ImportHistoryResponse>('/api/v1/imports?limit=20'),
    enabled: canImport,
  });

  const upload = useMutation({
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attendance-imports'] });
      await queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-details'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
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
