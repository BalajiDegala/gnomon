import type {
  ApprovalRouteImportResponse,
  ApprovalPreferencesDto,
  UpdateDepartmentApprovalPolicyRequest,
  UserDirectoryImportResponse,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface PreferencesResponse {
  preferences: ApprovalPreferencesDto;
}

export function useApprovalPreferences() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('policy:manage') ?? false;
  const canImport = user?.permissions.includes('imports:create') ?? false;
  const query = useQuery({
    queryKey: ['administration', 'approval-preferences'],
    queryFn: () => request<PreferencesResponse>('/api/v1/administration/approval-policies'),
    enabled: canManage,
  });
  const update = useMutation({
    mutationFn: ({
      policyId,
      input,
    }: {
      policyId: string;
      input: UpdateDepartmentApprovalPolicyRequest;
    }) =>
      request<PreferencesResponse>(`/api/v1/administration/approval-policies/${policyId}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(['administration', 'approval-preferences'], response);
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) =>
      request<UserDirectoryImportResponse>('/api/v1/imports/users/csv', {
        method: 'POST',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.text(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['administration', 'approval-preferences'] }),
        queryClient.invalidateQueries({ queryKey: ['employees', 'directory'] }),
        queryClient.invalidateQueries({ queryKey: ['security', 'directory'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance-details'] }),
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
    },
  });
  const approvalRouteUpload = useMutation({
    mutationFn: async (file: File) =>
      request<ApprovalRouteImportResponse>('/api/v1/imports/approval-routes/csv', {
        method: 'POST',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.text(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['administration', 'approval-preferences'],
      });
    },
  });

  return {
    canManage,
    canImport,
    preferences: query.data?.preferences ?? null,
    isLoading: query.isLoading,
    error: query.error ?? update.error ?? upload.error ?? approvalRouteUpload.error,
    isSaving: update.isPending,
    savingPolicyId: update.variables?.policyId ?? null,
    update: (policyId: string, input: UpdateDepartmentApprovalPolicyRequest) =>
      update.mutateAsync({ policyId, input }),
    isUploading: upload.isPending,
    importResult: upload.data,
    upload: (file: File) => upload.mutateAsync(file),
    isUploadingApprovalRoutes: approvalRouteUpload.isPending,
    approvalRouteImportResult: approvalRouteUpload.data,
    uploadApprovalRoutes: (file: File) => approvalRouteUpload.mutateAsync(file),
  };
}
