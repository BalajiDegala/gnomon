import type { SmtpSettingsDto, UpdateSmtpSettingsRequest } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface SmtpResponse {
  smtp: SmtpSettingsDto;
}

const queryKey = ['administration', 'smtp'];

export function useSmtpSettings() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('policy:manage') ?? false;
  const query = useQuery({
    queryKey,
    queryFn: () => request<SmtpResponse>('/api/v1/administration/smtp'),
    enabled: canManage,
  });
  const save = useMutation({
    mutationFn: (input: UpdateSmtpSettingsRequest) =>
      request<SmtpResponse>('/api/v1/administration/smtp', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
  });
  const test = useMutation({
    mutationFn: (to: string) =>
      request<SmtpResponse>('/api/v1/administration/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ to }),
      }),
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
  });
  return {
    canManage,
    settings: query.data?.smtp,
    isLoading: query.isLoading,
    loadError: query.error,
    save,
    test,
  };
}
