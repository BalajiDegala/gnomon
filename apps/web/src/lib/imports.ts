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
    mutationFn: async ({ source, file }: { source: AttendanceImportSource; file: File }) =>
      request<AttendanceImportResponse>(`/api/v1/imports/attendance/${source}/csv`, {
        method: 'POST',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.text(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attendance-imports'] });
      await queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] });
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
    upload: (source: AttendanceImportSource, file: File) => upload.mutateAsync({ source, file }),
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
