import type {
  AssignSecurityRoleRequest,
  ProvisionEmployeeAccountRequest,
  SecurityDirectoryDto,
  UpdateEmployeeAccountRequest,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface SecurityDirectoryResponse {
  directory: SecurityDirectoryDto;
}

export function useSecurityAdministration() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage =
    user?.grants.some(
      (grant) => grant.roleCode === 'SYSTEM_ADMIN' && grant.scope.type === 'company',
    ) ?? false;
  const queryKey = ['administration', 'security'];
  const query = useQuery({
    queryKey,
    queryFn: () => request<SecurityDirectoryResponse>('/api/v1/administration/security'),
    enabled: canManage,
  });
  const updateCache = (response: SecurityDirectoryResponse) => {
    queryClient.setQueryData(queryKey, response);
  };
  const provision = useMutation({
    mutationFn: (input: ProvisionEmployeeAccountRequest) =>
      request<SecurityDirectoryResponse>('/api/v1/administration/security/accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: updateCache,
  });
  const updateAccount = useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateEmployeeAccountRequest }) =>
      request<SecurityDirectoryResponse>(`/api/v1/administration/security/accounts/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: updateCache,
  });
  const assignRole = useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AssignSecurityRoleRequest }) =>
      request<SecurityDirectoryResponse>(
        `/api/v1/administration/security/accounts/${userId}/roles`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    onSuccess: updateCache,
  });
  const revokeRole = useMutation({
    mutationFn: ({ userId, assignmentId }: { userId: string; assignmentId: string }) =>
      request<SecurityDirectoryResponse>(
        `/api/v1/administration/security/accounts/${userId}/roles/${assignmentId}/revoke`,
        { method: 'POST' },
      ),
    onSuccess: updateCache,
  });

  return {
    canManage,
    directory: query.data?.directory,
    isLoading: query.isLoading,
    isUpdating:
      provision.isPending ||
      updateAccount.isPending ||
      assignRole.isPending ||
      revokeRole.isPending,
    error:
      query.error ?? provision.error ?? updateAccount.error ?? assignRole.error ?? revokeRole.error,
    provision: (input: ProvisionEmployeeAccountRequest) => provision.mutateAsync(input),
    updateAccount: (userId: string, input: UpdateEmployeeAccountRequest) =>
      updateAccount.mutateAsync({ userId, input }),
    assignRole: (userId: string, input: AssignSecurityRoleRequest) =>
      assignRole.mutateAsync({ userId, input }),
    revokeRole: (userId: string, assignmentId: string) =>
      revokeRole.mutateAsync({ userId, assignmentId }),
    clearError: () => {
      provision.reset();
      updateAccount.reset();
      assignRole.reset();
      revokeRole.reset();
    },
  };
}
