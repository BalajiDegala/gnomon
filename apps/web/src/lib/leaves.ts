import type {
  CreateLeaveRequest,
  LeaveBalanceDto,
  LeaveDecisionRequest,
  LeaveRequestDto,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface MyLeavesResponse {
  requests: LeaveRequestDto[];
  balances: LeaveBalanceDto[];
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
    isLoading: query.isLoading,
    isUpdating: create.isPending || cancel.isPending,
    error: query.error ?? create.error ?? cancel.error,
    create: (input: CreateLeaveRequest) => create.mutateAsync(input),
    cancel: (requestId: string) => cancel.mutateAsync(requestId),
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
    isLoading: query.isLoading,
    isUpdating: decision.isPending,
    error: query.error ?? decision.error,
    decide: (requestId: string, input: LeaveDecisionRequest) =>
      decision.mutateAsync({ requestId, input }),
  };
}
