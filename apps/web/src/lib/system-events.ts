import type {
  SystemEventCategory,
  SystemEventDto,
  SystemEventListResponse,
  SystemEventOutcome,
  SystemEventSeverity,
} from '@gnomon/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

export const SYSTEM_EVENT_RANGES = ['1h', '24h', '7d', '30d', '90d', '180d'] as const;
export type SystemEventRange = (typeof SYSTEM_EVENT_RANGES)[number];

const RANGE_MS: Record<SystemEventRange, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
  '180d': 180 * 86_400_000,
};

export interface SystemEventFilters {
  range: SystemEventRange;
  categories: SystemEventCategory[];
  severities: SystemEventSeverity[];
  outcome: SystemEventOutcome | 'all';
  employeeCode: string;
  q: string;
}

/** Build the API query; `from` is relative to `now` so refreshes slide the window. */
export function systemEventSearchParams(
  filters: SystemEventFilters,
  cursor: string | null,
  now = Date.now(),
): URLSearchParams {
  const parameters = new URLSearchParams({
    from: new Date(now - RANGE_MS[filters.range]).toISOString(),
    limit: '100',
  });
  if (filters.categories.length) parameters.set('category', filters.categories.join(','));
  if (filters.severities.length) parameters.set('severity', filters.severities.join(','));
  if (filters.outcome !== 'all') parameters.set('outcome', filters.outcome);
  if (filters.employeeCode.trim()) parameters.set('employeeCode', filters.employeeCode.trim());
  if (filters.q.trim()) parameters.set('q', filters.q.trim());
  if (cursor) parameters.set('cursor', cursor);
  return parameters;
}

export function useSystemEvents(filters: SystemEventFilters, autoRefresh: boolean) {
  const { request, user } = useAuth();
  const canRead = user?.permissions.includes('system:events:read') ?? false;
  const query = useInfiniteQuery({
    queryKey: ['system-events', filters],
    queryFn: ({ pageParam }) =>
      request<SystemEventListResponse>(
        `/api/v1/reports/events?${systemEventSearchParams(filters, pageParam)}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: canRead,
    refetchInterval: autoRefresh ? 15_000 : false,
  });
  const events: SystemEventDto[] = query.data?.pages.flatMap((page) => page.events) ?? [];
  return {
    canRead,
    events,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    refresh: () => void query.refetch(),
    updatedAt: query.dataUpdatedAt,
  };
}

export function useSystemEvent(eventId: string | null) {
  const { request } = useAuth();
  return useQuery({
    queryKey: ['system-events', 'detail', eventId],
    queryFn: () =>
      request<{ event: SystemEventDto }>(`/api/v1/reports/events/${eventId}`).then(
        (response) => response.event,
      ),
    enabled: Boolean(eventId),
    staleTime: Infinity,
  });
}
