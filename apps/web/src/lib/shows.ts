import type {
  AssignShowEmployeeRequest,
  CreateShowRequest,
  CreateTaskRequest,
  ShowAdminDto,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface ShowListResponse {
  shows: ShowAdminDto[];
}

interface ShowResponse {
  show: ShowAdminDto;
}

export function useShowAdministration() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('show:manage') ?? false;
  const query = useQuery({
    queryKey: ['shows', 'administration'],
    queryFn: () => request<ShowListResponse>('/api/v1/shows'),
    enabled: canManage,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['shows'] });
    await queryClient.invalidateQueries({ queryKey: ['timesheet-options'] });
  };
  const createShow = useMutation({
    mutationFn: (input: CreateShowRequest) =>
      request<ShowResponse>('/api/v1/shows', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: refresh,
  });
  const createTask = useMutation({
    mutationFn: ({ showId, input }: { showId: string; input: CreateTaskRequest }) =>
      request<ShowResponse>(`/api/v1/shows/${showId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
  const assignEmployee = useMutation({
    mutationFn: ({ showId, input }: { showId: string; input: AssignShowEmployeeRequest }) =>
      request<ShowResponse>(`/api/v1/shows/${showId}/assignments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });

  return {
    canManage,
    shows: query.data?.shows ?? [],
    isLoading: query.isLoading,
    error: query.error ?? createShow.error ?? createTask.error ?? assignEmployee.error,
    isUpdating: createShow.isPending || createTask.isPending || assignEmployee.isPending,
    createShow: (input: CreateShowRequest) => createShow.mutateAsync(input),
    createTask: (showId: string, input: CreateTaskRequest) =>
      createTask.mutateAsync({ showId, input }),
    assignEmployee: (showId: string, input: AssignShowEmployeeRequest) =>
      assignEmployee.mutateAsync({ showId, input }),
  };
}
