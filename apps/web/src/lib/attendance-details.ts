import type { AttendanceDetailsDto } from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

interface AttendanceDetailsResponse {
  attendance: AttendanceDetailsDto;
}

export function useAttendanceDetails(month: string) {
  const { request, user } = useAuth();
  const canRead =
    user?.permissions.some((permission) =>
      ['attendance:all:read', 'attendance:team:read', 'audit:read'].includes(permission),
    ) ?? false;
  const query = useQuery({
    queryKey: ['attendance-details', month || 'latest'],
    queryFn: () =>
      request<AttendanceDetailsResponse>(
        `/api/v1/reports/attendance-details${month ? `?month=${encodeURIComponent(month)}` : ''}`,
      ),
    enabled: canRead,
  });
  return {
    canRead,
    attendance: query.data?.attendance,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
