import type {
  ManagedCalendarAudienceType,
  ManagedCalendarDto,
  PersonalCalendarDto,
} from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

interface CalendarResponse {
  calendar: PersonalCalendarDto;
}

interface ManagedCalendarResponse {
  calendar: ManagedCalendarDto;
}

export function currentIndiaMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

export function usePersonalCalendar(month: string) {
  const { request, user } = useAuth();
  const canRead = user?.permissions.includes('attendance:self:read') ?? false;
  const query = useQuery({
    queryKey: ['calendar', month],
    queryFn: () => request<CalendarResponse>(`/api/v1/calendar?month=${month}`),
    enabled: canRead,
  });
  return {
    canRead,
    calendar: query.data?.calendar,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useManagedCalendar(
  month: string,
  audienceType?: ManagedCalendarAudienceType,
  showId?: string,
) {
  const { request, user } = useAuth();
  const canRead = user?.permissions.includes('attendance:team:read') ?? false;
  const parameters = new URLSearchParams({ month });
  if (audienceType) parameters.set('audienceType', audienceType);
  if (audienceType === 'show' && showId) parameters.set('showId', showId);
  const query = useQuery({
    queryKey: ['managed-calendar', month, audienceType, showId],
    queryFn: () => request<ManagedCalendarResponse>(`/api/v1/calendar/managed?${parameters}`),
    enabled: canRead && (audienceType !== 'show' || Boolean(showId)),
  });
  return {
    canRead,
    calendar: query.data?.calendar,
    isLoading: query.isLoading,
    error: query.error,
  };
}
