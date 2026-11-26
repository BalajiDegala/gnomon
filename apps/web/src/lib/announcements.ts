import type {
  AnnouncementDepartment,
  AnnouncementDto,
  AnnouncementFeed,
  CreateAnnouncementRequest,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

const FEED_KEY = ['announcements'] as const;

/** Messages for the Overview page; shares the bell's read state. */
export function useAnnouncements() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: FEED_KEY }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  const query = useQuery({
    queryKey: FEED_KEY,
    queryFn: () =>
      request<{ announcements: AnnouncementFeed }>('/api/v1/announcements').then(
        (body) => body.announcements,
      ),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const send = useMutation({
    mutationFn: (input: CreateAnnouncementRequest) =>
      request<{ announcement: AnnouncementDto }>('/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/v1/announcements/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => request<void>(`/api/v1/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return {
    canSend: query.data?.canSend ?? false,
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    send: (input: CreateAnnouncementRequest) => send.mutateAsync(input),
    isSending: send.isPending,
    markRead: (id: string) => read.mutateAsync(id),
    withdraw: (id: string) => withdraw.mutateAsync(id),
  };
}

export function useAnnouncementDepartments(enabled: boolean) {
  const { request } = useAuth();
  return useQuery({
    queryKey: ['announcements', 'departments'],
    queryFn: () =>
      request<{ departments: AnnouncementDepartment[] }>('/api/v1/announcements/departments').then(
        (body) => body.departments,
      ),
    enabled,
    staleTime: 5 * 60_000,
  });
}
