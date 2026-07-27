import type { AttendanceSignalsDto, TodayTimecard } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth';

interface TimecardResponse {
  timecard: TodayTimecard;
  signals: AttendanceSignalsDto;
}

export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function formatIndiaTime(instant: string | null): string {
  if (!instant) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(instant));
}

export function useTodayTimecard() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const [clock, setClock] = useState(Date.now());
  const canRead = user?.permissions.includes('attendance:self:read') ?? false;
  const canWrite = user?.permissions.includes('attendance:self:write') ?? false;

  const query = useQuery({
    queryKey: ['timecard', 'today'],
    queryFn: () => request<TimecardResponse>('/api/v1/timecard/today'),
    enabled: canRead,
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (operation: 'start' | 'stop') =>
      request<TimecardResponse>(`/api/v1/timecard/${operation}`, { method: 'POST' }),
    onSuccess: (response) => {
      queryClient.setQueryData(['timecard', 'today'], response);
      setClock(Date.now());
    },
  });

  const timecard = query.data?.timecard;

  useEffect(() => {
    if (!timecard?.activeSession) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [timecard?.activeSession]);

  const trackedSeconds = useMemo(() => {
    if (!timecard) return 0;
    if (!timecard.activeSession) return timecard.totalTrackedSeconds;
    const elapsedSinceResponse = Math.max(
      0,
      Math.floor((clock - new Date(timecard.serverNow).getTime()) / 1_000),
    );
    return timecard.totalTrackedSeconds + elapsedSinceResponse;
  }, [clock, timecard]);

  return {
    canRead,
    canWrite,
    error: mutation.error ?? query.error,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
    timecard,
    signals: query.data?.signals,
    trackedSeconds,
    toggle: () => mutation.mutate(timecard?.activeSession ? 'stop' : 'start'),
  };
}
