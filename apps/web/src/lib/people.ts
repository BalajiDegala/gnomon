import type {
  CreateEmployeeRequest,
  EmployeeDirectoryDto,
  EmployeeDirectoryItemDto,
  UpdateEmployeeRequest,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface DirectoryResponse {
  directory: EmployeeDirectoryDto;
}

interface EmployeeResponse {
  employee: EmployeeDirectoryItemDto;
}

export function useEmployeeDirectory() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = user?.permissions.includes('employee:read') ?? false;
  const query = useQuery({
    queryKey: ['employees', 'directory'],
    queryFn: () => request<DirectoryResponse>('/api/v1/employees'),
    enabled: canRead,
  });
  const create = useMutation({
    mutationFn: (input: CreateEmployeeRequest) =>
      request<EmployeeResponse>('/api/v1/employees', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees', 'directory'] }),
  });
  const update = useMutation({
    mutationFn: ({ employeeId, input }: { employeeId: string; input: UpdateEmployeeRequest }) =>
      request<EmployeeResponse>(`/api/v1/employees/${employeeId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees', 'directory'] }),
  });

  return {
    canRead,
    canCreate: query.data?.directory.canCreate ?? false,
    canUpdate: query.data?.directory.canUpdate ?? false,
    employees: query.data?.directory.employees ?? [],
    isLoading: query.isLoading,
    isUpdating: create.isPending || update.isPending,
    error: query.error ?? create.error ?? update.error,
    create: (input: CreateEmployeeRequest) => create.mutateAsync(input),
    update: (employeeId: string, input: UpdateEmployeeRequest) =>
      update.mutateAsync({ employeeId, input }),
  };
}
