import type { PersonalCalendarDto } from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

interface CalendarResponse {
  calendar: PersonalCalendarDto;
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
