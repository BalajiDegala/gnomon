import type {
  CreateLeaveRequest,
  HolidayDto,
  LeaveApprovalRoutePreviewDto,
  LeaveBalanceDto,
  LeaveDecisionRequest,
  LeaveRequestDto,
  LeaveWorkCheckDto,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface MyLeavesResponse {
  requests: LeaveRequestDto[];
  balances: LeaveBalanceDto[];
  holidays: HolidayDto[];
  approvalRoute: LeaveApprovalRoutePreviewDto;
}

interface LeaveListResponse {
  requests: LeaveRequestDto[];
}

interface LeaveResponse {
  request: LeaveRequestDto;
}

async function refreshLeaveQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['leaves'] }),
    queryClient.invalidateQueries({ queryKey: ['leave-approvals'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  ]);
}

export function useMyLeaves(year: number) {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = user?.permissions.includes('leave:create') ?? false;
  const query = useQuery({
    queryKey: ['leaves', 'mine', year],
    queryFn: () => request<MyLeavesResponse>(`/api/v1/leaves/mine?year=${year}`),
    enabled: canCreate,
  });
  const create = useMutation({
    mutationFn: (input: CreateLeaveRequest) =>
      request<LeaveResponse>('/api/v1/leaves', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => refreshLeaveQueries(queryClient),
  });
  const cancel = useMutation({
    mutationFn: (requestId: string) =>
      request<LeaveResponse>(`/api/v1/leaves/${requestId}/cancel`, { method: 'POST' }),
    onSuccess: () => refreshLeaveQueries(queryClient),
  });

  return {
    canCreate,
    requests: query.data?.requests ?? [],
    balances: query.data?.balances ?? [],
    holidays: query.data?.holidays ?? [],
    approvalRoute: query.data?.approvalRoute ?? null,
    isLoading: query.isLoading,
    isUpdating: create.isPending || cancel.isPending,
    error: query.error ?? create.error ?? cancel.error,
    create: (input: CreateLeaveRequest) => create.mutateAsync(input),
    cancel: (requestId: string) => cancel.mutateAsync(requestId),
    /** Days in the range that already have recorded work (to confirm before applying). */
    checkRecordedWork: (startDate: string, endDate: string) =>
      request<LeaveWorkCheckDto>(
        `/api/v1/leaves/work-check?startDate=${startDate}&endDate=${endDate}`,
      ).then((response) => response.days),
  };
}

export function useLeaveApprovals() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canApprove = user?.permissions.includes('leave:approve') ?? false;
  const query = useQuery({
    queryKey: ['leave-approvals'],
    queryFn: () => request<LeaveListResponse>('/api/v1/approvals/leaves'),
    enabled: canApprove,
  });
  const history = useQuery({
    queryKey: ['leave-approvals', 'history'],
    queryFn: () => request<LeaveListResponse>('/api/v1/approvals/leaves/history'),
    enabled: canApprove,
  });
  const decision = useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: LeaveDecisionRequest }) =>
      request<LeaveResponse>(`/api/v1/approvals/leaves/${requestId}/decision`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => refreshLeaveQueries(queryClient),
  });

  return {
    canApprove,
    requests: query.data?.requests ?? [],
    history: history.data?.requests ?? [],
    isLoading: query.isLoading,
    isHistoryLoading: history.isLoading,
    isUpdating: decision.isPending,
    error: query.error ?? decision.error,
    historyError: history.error,
    decide: (requestId: string, input: LeaveDecisionRequest) =>
      decision.mutateAsync({ requestId, input }),
  };
}
