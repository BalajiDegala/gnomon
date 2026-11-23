import type { LdapSettingsDto, TestLdapRequest, UpdateLdapSettingsRequest } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface LdapResponse {
  ldap: LdapSettingsDto;
}

const queryKey = ['administration', 'ldap'];

export function useLdapSettings() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('policy:manage') ?? false;
  const query = useQuery({
    queryKey,
    queryFn: () => request<LdapResponse>('/api/v1/administration/ldap'),
    enabled: canManage,
  });
  const save = useMutation({
    mutationFn: (input: UpdateLdapSettingsRequest) =>
      request<LdapResponse>('/api/v1/administration/ldap', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
  });
  const test = useMutation({
    mutationFn: (input: TestLdapRequest) =>
      request<LdapResponse>('/api/v1/administration/ldap/test', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
  });
  return {
    canManage,
    settings: query.data?.ldap,
    isLoading: query.isLoading,
    loadError: query.error,
    save,
    test,
  };
}
