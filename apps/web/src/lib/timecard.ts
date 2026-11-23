import type {
  AttendanceSignalsDto,
  DailyReconciliationDto,
  TodayTimecard,
  WorkMode,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from './auth';

interface TimecardResponse {
  timecard: TodayTimecard;
  signals: AttendanceSignalsDto;
  reconciliation: DailyReconciliationDto;
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

  // The shift is chosen before the day's first start and then fixed. The work
  // mode is chosen for every start, so a day can continue from home after
  // leaving the office; while a session runs it shows that session's mode.
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState<WorkMode>('office');

  const mutation = useMutation({
    mutationFn: (operation: 'start' | 'stop') =>
      request<TimecardResponse>(`/api/v1/timecard/${operation}`, {
        method: 'POST',
        ...(operation === 'start'
          ? {
              body: JSON.stringify({
                ...(selectedShiftId ? { shiftId: selectedShiftId } : {}),
                workMode: selectedWorkMode,
              }),
            }
          : {}),
      }),
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

  const shifts = timecard?.shifts ?? [];
  const workContext = timecard?.workContext;
  const shiftLocked = Boolean(workContext?.shiftName);
  const activeWorkMode = timecard?.activeSession?.workMode ?? null;
  const defaultShiftId = shifts.find((shift) => shift.isDefault)?.id ?? shifts[0]?.id ?? '';
  const shiftId = shiftLocked
    ? (workContext?.shiftId ?? '')
    : selectedShiftId && shifts.some((shift) => shift.id === selectedShiftId)
      ? selectedShiftId
      : defaultShiftId;

  return {
    canRead,
    shifts,
    workContext,
    shiftLocked,
    /** True while a session is running; switch work mode by stopping and starting again. */
    workModeLocked: Boolean(timecard?.activeSession),
    shiftId,
    workMode: activeWorkMode ?? selectedWorkMode,
    setShiftId: setSelectedShiftId,
    setWorkMode: setSelectedWorkMode,
    canWrite,
    error: mutation.error ?? query.error,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
    timecard,
    signals: query.data?.signals,
    reconciliation: query.data?.reconciliation,
    trackedSeconds,
    toggle: () => mutation.mutate(timecard?.activeSession ? 'stop' : 'start'),
  };
}
