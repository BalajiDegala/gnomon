import type {
  AttendanceActionItem,
  AttendanceActionItemsDto,
  LeaveBalanceDto,
  LeaveDayPart,
  LeaveType,
} from '@gnomon/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

const queryKey = ['attendance-action-items'];

export function useAttendanceActionItems() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = user?.permissions.includes('attendance:self:read') ?? false;
  const query = useQuery({
    queryKey,
    queryFn: () => request<AttendanceActionItemsDto>('/api/v1/timecard/action-items'),
    enabled: canRead,
  });
  return {
    canRead,
    data: query.data,
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refresh: () => queryClient.invalidateQueries({ queryKey }),
  };
}

export type ActionChoice = 'leave' | 'regularisation';

/** Editable state of one detected day in the action panel. */
export interface ActionRow {
  selected: boolean;
  action: ActionChoice;
  leaveType: LeaveType;
  dayPart: LeaveDayPart;
  /** India-time HH:mm for the corrected window. */
  start: string;
  end: string;
  /** Reason sent with this day's request. */
  reason: string;
}

export function indiaTimeInput(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

/** Corrected window as instants; an end at or before the start rolls to the next day. */
export function correctedWindow(
  workDate: string,
  start: string,
  end: string,
): { requestedStart: string; requestedEnd: string } {
  const startAt = new Date(`${workDate}T${start}:00+05:30`);
  let endAt = new Date(`${workDate}T${end}:00+05:30`);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
  return { requestedStart: startAt.toISOString(), requestedEnd: endAt.toISOString() };
}

/** Paid leave with balance first; unpaid (LOP) when nothing is left. */
export function defaultLeaveType(balances: readonly LeaveBalanceDto[]): LeaveType {
  for (const type of ['casual', 'earned', 'comp_off'] as const) {
    const balance = balances.find((candidate) => candidate.leaveType === type);
    if (balance && (!balance.balanceTracked || (balance.availableDays ?? 0) >= 0.5)) return type;
  }
  return 'unpaid';
}

export function initialActionRow(
  item: AttendanceActionItem,
  balances: readonly LeaveBalanceDto[],
): ActionRow {
  return {
    selected: false,
    action: item.suggestedAction,
    leaveType: defaultLeaveType(balances),
    // Absent days are a full day off; a partial day most likely means leaving early.
    dayPart: item.kind === 'absent' ? 'full_day' : 'second_half',
    start: indiaTimeInput(item.detectedStart ?? item.expectedStart),
    end: indiaTimeInput(item.detectedEnd ?? item.expectedEnd),
    reason: '',
  };
}
