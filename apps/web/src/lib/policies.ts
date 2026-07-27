import type {
  EmployeeLeaveBalanceAdministrationDto,
  HolidayDto,
  UpdateLeaveBalanceRequest,
  UpsertHolidayRequest,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface HolidayListResponse {
  holidays: HolidayDto[];
}

interface HolidayResponse {
  holiday: HolidayDto;
}

interface EmployeeBalanceResponse {
  employee: EmployeeLeaveBalanceAdministrationDto;
}

async function refreshPolicyQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['administration', 'holidays'] }),
    queryClient.invalidateQueries({ queryKey: ['administration', 'leave-balances'] }),
    queryClient.invalidateQueries({ queryKey: ['leaves'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] }),
  ]);
}

export function useHolidayAdministration(year: number) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('policy:manage') ?? false;
  const query = useQuery({
    queryKey: ['administration', 'holidays', year],
    queryFn: () => request<HolidayListResponse>(`/api/v1/administration/holidays?year=${year}`),
    enabled: canManage,
  });
  const upsert = useMutation({
    mutationFn: (input: UpsertHolidayRequest) =>
      request<HolidayResponse>('/api/v1/administration/holidays', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => refreshPolicyQueries(queryClient),
  });
  const archive = useMutation({
    mutationFn: (holidayId: string) =>
      request<HolidayResponse>(`/api/v1/administration/holidays/${holidayId}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => refreshPolicyQueries(queryClient),
  });

  return {
    canManage,
    holidays: query.data?.holidays ?? [],
    isLoading: query.isLoading,
    isUpdating: upsert.isPending || archive.isPending,
    error: query.error ?? upsert.error ?? archive.error,
    upsert: (input: UpsertHolidayRequest) => upsert.mutateAsync(input),
    archive: (holidayId: string) => archive.mutateAsync(holidayId),
  };
}

export function useEmployeeLeaveBalanceAdministration(employeeCode: string, year: number) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('employee:update') ?? false;
  const normalizedCode = employeeCode.trim().toUpperCase();
  const query = useQuery({
    queryKey: ['administration', 'leave-balances', normalizedCode, year],
    queryFn: () =>
      request<EmployeeBalanceResponse>(
        `/api/v1/administration/leave-balances?employeeCode=${encodeURIComponent(normalizedCode)}&year=${year}`,
      ),
    enabled: canManage && normalizedCode.length >= 2,
  });
  const update = useMutation({
    mutationFn: (input: UpdateLeaveBalanceRequest) =>
      request<EmployeeBalanceResponse>(
        `/api/v1/administration/leave-balances/${encodeURIComponent(normalizedCode)}`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    onSuccess: () => refreshPolicyQueries(queryClient),
  });

  return {
    canManage,
    employee: query.data?.employee,
    isLoading: query.isLoading,
    isUpdating: update.isPending,
    error: query.error ?? update.error,
    update: (input: UpdateLeaveBalanceRequest) => update.mutateAsync(input),
  };
}
