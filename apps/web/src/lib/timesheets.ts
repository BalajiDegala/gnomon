import type { CreateTimeEntryRequest, TimesheetDayDto, TimesheetOption } from '@gnomon/shared';
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

  const applyDay = (response: DayResponse) => {
    queryClient.setQueryData(['timesheet-day', response.day.workDate], response);
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
  const submit = useMutation({
    mutationFn: () =>
      request<DayResponse>('/api/v1/timesheets/submit', {
        method: 'POST',
        body: JSON.stringify({ workDate }),
      }),
    onSuccess: applyDay,
  });

  return {
    canCreate,
    options: options.data?.options ?? [],
    day: day.data?.day,
    isLoading: options.isLoading || day.isLoading,
    isUpdating: create.isPending || remove.isPending || submit.isPending,
    error: options.error ?? day.error ?? create.error ?? remove.error ?? submit.error,
    create: (input: CreateTimeEntryRequest) => create.mutateAsync(input),
    remove: (entryId: string) => remove.mutateAsync(entryId),
    submit: () => submit.mutateAsync(),
  };
}
