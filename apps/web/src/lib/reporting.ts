import type { WorkforceReportDto } from '@gnomon/shared';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';

interface WorkforceReportResponse {
  report: WorkforceReportDto;
}

export function useWorkforceReport(dateFrom: string, dateTo: string) {
  const { request, user } = useAuth();
  const canRead =
    user?.permissions.some((permission) =>
      ['attendance:all:read', 'attendance:team:read', 'audit:read'].includes(permission),
    ) ?? false;
  const query = useQuery({
    queryKey: ['reports', 'workforce', dateFrom, dateTo],
    queryFn: () =>
      request<WorkforceReportResponse>(
        `/api/v1/reports/workforce?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      ),
    enabled: canRead && Boolean(dateFrom && dateTo),
  });

  return {
    canRead,
    report: query.data?.report,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refresh: query.refetch,
  };
}
