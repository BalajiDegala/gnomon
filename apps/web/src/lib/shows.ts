import type { CreateShowRequest, ShowAdminDto, UpdateShowRequest } from '@gnomon/shared';
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
  const updateShow = useMutation({
    mutationFn: ({ showId, input }: { showId: string; input: UpdateShowRequest }) =>
      request<ShowResponse>(`/api/v1/shows/${showId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
  return {
    canManage,
    shows: query.data?.shows ?? [],
    isLoading: query.isLoading,
    error: query.error ?? createShow.error ?? updateShow.error,
    isUpdating: createShow.isPending || updateShow.isPending,
    createShow: (input: CreateShowRequest) => createShow.mutateAsync(input),
    updateShow: (showId: string, input: UpdateShowRequest) =>
      updateShow.mutateAsync({ showId, input }),
    clearError: () => {
      createShow.reset();
      updateShow.reset();
    },
  };
}
