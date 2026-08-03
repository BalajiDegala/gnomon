import type {
  CompanyHolidayRequest,
  CreateLocationRequest,
  EmployeeLeaveBalanceAdministrationDto,
  EmployeeLocationAdministrationDto,
  HolidayDto,
  LocationDirectoryDto,
  UpdateEmployeeLocationRequest,
  UpdateLeaveBalanceRequest,
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

interface LocationDirectoryResponse {
  directory: LocationDirectoryDto;
}

interface EmployeeLocationResponse {
  employee: EmployeeLocationAdministrationDto;
}

async function refreshPolicyQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['administration', 'holidays'] }),
    queryClient.invalidateQueries({ queryKey: ['administration', 'leave-balances'] }),
    queryClient.invalidateQueries({ queryKey: ['administration', 'locations'] }),
    queryClient.invalidateQueries({ queryKey: ['administration', 'employee-location'] }),
    queryClient.invalidateQueries({ queryKey: ['leaves'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] }),
  ]);
}

export function useLocationAdministration() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canRead =
    user?.grants.some(
      (grant) =>
        (grant.permissions.includes('policy:manage') ||
          grant.permissions.includes('employee:update')) &&
        (grant.scope.type === 'company' || grant.scope.type === 'location'),
    ) ?? false;
  const query = useQuery({
    queryKey: ['administration', 'locations'],
    queryFn: () => request<LocationDirectoryResponse>('/api/v1/administration/locations'),
    enabled: canRead,
  });
  const create = useMutation({
    mutationFn: (input: CreateLocationRequest) =>
      request<LocationDirectoryResponse>('/api/v1/administration/locations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(['administration', 'locations'], response);
    },
  });

  return {
    canRead,
    canCreate: query.data?.directory.canCreateLocations ?? false,
    locations: query.data?.directory.locations ?? [],
    isLoading: query.isLoading,
    isUpdating: create.isPending,
    error: query.error ?? create.error,
    create: (input: CreateLocationRequest) => create.mutateAsync(input),
  };
}

export function useEmployeeLocationAdministration(employeeCode: string) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage =
    user?.grants.some(
      (grant) =>
        ['HR', 'SYSTEM_ADMIN'].includes(grant.roleCode) &&
        grant.permissions.includes('employee:update') &&
        (grant.scope.type === 'company' || grant.scope.type === 'location'),
    ) ?? false;
  const canClear =
    user?.grants.some(
      (grant) =>
        ['HR', 'SYSTEM_ADMIN'].includes(grant.roleCode) &&
        grant.permissions.includes('employee:update') &&
        grant.scope.type === 'company',
    ) ?? false;
  const normalizedCode = employeeCode.trim().toUpperCase();
  const query = useQuery({
    queryKey: ['administration', 'employee-location', normalizedCode],
    queryFn: () =>
      request<EmployeeLocationResponse>(
        `/api/v1/administration/employee-locations?employeeCode=${encodeURIComponent(normalizedCode)}`,
      ),
    enabled: canManage && normalizedCode.length >= 2,
  });
  const update = useMutation({
    mutationFn: (input: UpdateEmployeeLocationRequest) =>
      request<EmployeeLocationResponse>(
        `/api/v1/administration/employee-locations/${encodeURIComponent(normalizedCode)}`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(['administration', 'employee-location', normalizedCode], response);
      await refreshPolicyQueries(queryClient);
    },
  });

  return {
    canManage,
    canClear,
    employee: query.data?.employee,
    isLoading: query.isLoading,
    isUpdating: update.isPending,
    error: query.error ?? update.error,
    update: (locationId: string | null) => update.mutateAsync({ locationId }),
  };
}

export function useHolidayAdministration(year: number) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage =
    user?.grants.some(
      (grant) => grant.permissions.includes('policy:manage') && grant.scope.type === 'company',
    ) ?? false;
  const query = useQuery({
    queryKey: ['administration', 'holidays', year],
    queryFn: () => request<HolidayListResponse>(`/api/v1/administration/holidays?year=${year}`),
    enabled: canManage,
  });
  const upsert = useMutation({
    mutationFn: (input: CompanyHolidayRequest) =>
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
    upsert: (input: CompanyHolidayRequest) => upsert.mutateAsync(input),
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
