import type {
  CreateRegularisationRequest,
  RegularisationDecisionRequest,
  RegularisationRequestDto,
} from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface RequestListResponse {
  requests: RegularisationRequestDto[];
}

interface RequestResponse {
  request: RegularisationRequestDto;
}

async function refreshRegularisationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['regularisations'] }),
    queryClient.invalidateQueries({ queryKey: ['regularisation-approvals'] }),
    queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] }),
  ]);
}

export function useMyRegularisations() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = user?.permissions.includes('regularisation:create') ?? false;
  const query = useQuery({
    queryKey: ['regularisations', 'mine'],
    queryFn: () => request<RequestListResponse>('/api/v1/regularisations/mine'),
    enabled: canCreate,
  });
  const create = useMutation({
    mutationFn: (input: CreateRegularisationRequest) =>
      request<RequestResponse>('/api/v1/regularisations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => refreshRegularisationQueries(queryClient),
  });
  const cancel = useMutation({
    mutationFn: (requestId: string) =>
      request<RequestResponse>(`/api/v1/regularisations/${requestId}/cancel`, {
        method: 'POST',
      }),
    onSuccess: () => refreshRegularisationQueries(queryClient),
  });

  return {
    canCreate,
    requests: query.data?.requests ?? [],
    isLoading: query.isLoading,
    isUpdating: create.isPending || cancel.isPending,
    error: query.error ?? create.error ?? cancel.error,
    create: (input: CreateRegularisationRequest) => create.mutateAsync(input),
    cancel: (requestId: string) => cancel.mutateAsync(requestId),
  };
}

export function useRegularisationApprovals() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canApprove = user?.permissions.includes('regularisation:approve') ?? false;
  const query = useQuery({
    queryKey: ['regularisation-approvals'],
    queryFn: () => request<RequestListResponse>('/api/v1/approvals/regularisations'),
    enabled: canApprove,
  });
  const decide = useMutation({
    mutationFn: ({
      requestId,
      input,
    }: {
      requestId: string;
      input: RegularisationDecisionRequest;
    }) =>
      request<RequestResponse>(`/api/v1/approvals/regularisations/${requestId}/decision`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => refreshRegularisationQueries(queryClient),
  });

  return {
    canApprove,
    requests: query.data?.requests ?? [],
    isLoading: query.isLoading,
    isUpdating: decide.isPending,
    error: query.error ?? decide.error,
    decide: (requestId: string, input: RegularisationDecisionRequest) =>
      decide.mutateAsync({ requestId, input }),
  };
}
