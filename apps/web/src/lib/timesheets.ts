import type {
  CreateTimeEntryRequest,
  TimesheetDayDto,
  TimesheetOption,
  UpdateTimeEntryRequest,
} from '@gnomon/shared';
import { getWorkDate } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface OptionsResponse {
  options: TimesheetOption[];
}

interface DayResponse {
  day: TimesheetDayDto;
}

export function currentIndiaWorkDate(): string {
  return getWorkDate(new Date());
}

export function indiaLocalInputToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

export function useTimesheetDay(workDate: string) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = user?.permissions.includes('timesheet:create') ?? false;
  const options = useQuery({
    queryKey: ['timesheet-options'],
    queryFn: () => request<OptionsResponse>('/api/v1/timesheets/options'),
    enabled: canCreate,
  });
  const day = useQuery({
    queryKey: ['timesheet-day', workDate],
    queryFn: () => request<DayResponse>(`/api/v1/timesheets?workDate=${workDate}`),
    enabled: canCreate,
  });

  const applyDay = async (response: DayResponse) => {
    queryClient.setQueryData(['timesheet-day', response.day.workDate], response);
    await queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] });
  };
  const create = useMutation({
    mutationFn: (input: CreateTimeEntryRequest) =>
      request<DayResponse>('/api/v1/timesheets/entries', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: applyDay,
  });
  const remove = useMutation({
    mutationFn: (entryId: string) =>
      request<DayResponse>(`/api/v1/timesheets/entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: applyDay,
  });
  const update = useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: UpdateTimeEntryRequest }) =>
      request<DayResponse>(`/api/v1/timesheets/entries/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: applyDay,
  });

  return {
    canCreate,
    options: options.data?.options ?? [],
    day: day.data?.day,
    isLoading: options.isLoading || day.isLoading,
    isUpdating: create.isPending || update.isPending || remove.isPending,
    isSaving: create.isPending || update.isPending,
    isDeleting: remove.isPending,
    error: options.error ?? day.error ?? create.error ?? update.error ?? remove.error,
    create: (input: CreateTimeEntryRequest) => create.mutateAsync(input),
    update: (entryId: string, input: UpdateTimeEntryRequest) =>
      update.mutateAsync({ entryId, input }),
    remove: (entryId: string) => remove.mutateAsync(entryId),
    clearError: () => {
      create.reset();
      update.reset();
      remove.reset();
    },
  };
}
