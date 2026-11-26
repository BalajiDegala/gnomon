import type {
  AvailabilityDirectory,
  AvailabilityMode,
  AvailabilityStatus,
  MyAvailability,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

const REFRESH_MS = 60_000;

/** Theme palette paths for the status dot (use with `sx={{ bgcolor }}`). */
export const availabilityStatusColors: Record<AvailabilityStatus, string> = {
  available: 'success.main',
  busy: 'error.main',
  away: 'text.disabled',
};

/** Everyone's availability, refreshed every minute while the page is open. */
export function useAvailabilityDirectory() {
  const { request } = useAuth();
  return useQuery({
    queryKey: ['availability', 'directory'],
    queryFn: () =>
      request<{ availability: AvailabilityDirectory }>('/api/v1/availability').then(
        (body) => body.availability,
      ),
    refetchInterval: REFRESH_MS,
  });
}

/** Your own mode and the status colleagues currently see. */
export function useMyAvailability() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['availability', 'me'],
    queryFn: () =>
      request<{ availability: MyAvailability }>('/api/v1/availability/me').then(
        (body) => body.availability,
      ),
    enabled: Boolean(user),
    refetchInterval: REFRESH_MS,
  });
  const setMode = useMutation({
    mutationFn: (mode: AvailabilityMode) =>
      request<{ availability: MyAvailability }>('/api/v1/availability/me', {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }).then((body) => body.availability),
    onSuccess: (availability) => {
      queryClient.setQueryData(['availability', 'me'], availability);
      void queryClient.invalidateQueries({ queryKey: ['availability', 'directory'] });
    },
  });
  return { availability: query.data ?? null, setMode };
}
