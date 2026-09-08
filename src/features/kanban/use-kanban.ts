'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadStatus } from '@prisma/client';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import { filtersToSearchParams } from '@/features/leads/query';
import type { LeadFilters } from '@/features/leads/schema';
import { apiGet, apiPatch } from '@/lib/api-client';
import type { KanbanColumn } from '@/server/services/kanban.service';

export function kanbanColumnUrl(
  column: LeadStatus,
  offset: number,
  filters: LeadFilters,
): string {
  const params = filtersToSearchParams(filters);
  params.set('column', column);
  params.set('offset', String(offset));
  return `/api/kanban?${params.toString()}`;
}

export function useKanbanColumn(status: LeadStatus, filters: LeadFilters) {
  return useInfiniteQuery({
    queryKey: ['kanban', status, filters],
    queryFn: ({ pageParam, signal }) =>
      apiGet<KanbanColumn>(kanbanColumnUrl(status, pageParam, filters), signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 30_000,
  });
}

export function useChangeLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      apiPatch<{ id: string; status: LeadStatus }>(`/api/leads/${id}/status`, { status }),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'dashboard', 'contacts', 'reports']);
    },
  });
}
