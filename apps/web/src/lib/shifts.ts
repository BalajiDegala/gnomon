import type { ShiftDto, ShiftRequest } from '@gnomon/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';

interface ShiftsResponse {
  shifts: ShiftDto[];
}

export function useShiftAdministration() {
  const { request, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('policy:manage') ?? false;
  const query = useQuery({
    queryKey: ['administration', 'shifts'],
    queryFn: () => request<ShiftsResponse>('/api/v1/administration/shifts'),
    enabled: canManage,
  });
  const save = useMutation({
    mutationFn: ({ shiftId, input }: { shiftId: string | null; input: ShiftRequest }) =>
      request<ShiftsResponse>(
        shiftId ? `/api/v1/administration/shifts/${shiftId}` : '/api/v1/administration/shifts',
        { method: shiftId ? 'PUT' : 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(['administration', 'shifts'], response);
      // Timecard dropdowns list the active shifts.
      await queryClient.invalidateQueries({ queryKey: ['timecard', 'today'] });
    },
  });
  return {
    canManage,
    shifts: query.data?.shifts ?? [],
    isLoading: query.isLoading,
    error: save.error ?? query.error,
    isSaving: save.isPending,
    save: (shiftId: string | null, input: ShiftRequest) => save.mutateAsync({ shiftId, input }),
  };
}
