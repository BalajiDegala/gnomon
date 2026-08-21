import type { NotificationListDto } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface NotificationResponse {
  notifications: NotificationListDto;
}

export function useNotifications() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => request<NotificationResponse>('/api/v1/notifications?limit=20'),
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const read = useMutation({
    mutationFn: (notificationId: string) =>
      request<NotificationResponse>(`/api/v1/notifications/${notificationId}/read`, {
        method: 'POST',
      }),
    onSuccess: (response) => queryClient.setQueryData(['notifications'], response),
  });
  const readAll = useMutation({
    mutationFn: () =>
      request<NotificationResponse>('/api/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: (response) => queryClient.setQueryData(['notifications'], response),
  });

  return {
    notifications: query.data?.notifications ?? { unreadCount: 0, items: [] },
    markRead: (notificationId: string) => read.mutateAsync(notificationId),
    markAllRead: () => readAll.mutateAsync(),
  };
}
