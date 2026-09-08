'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { ContactQueue } from '@/server/services/contacts.service';
import type { FollowUpListResult, SerializedFollowUp } from '@/server/services/follow-up.service';
import type { CreateInteractionInput } from '@/features/interactions/schema';
import type { ContactBucket } from '@/lib/priority';

export function useContactsToday(params: {
  bucket?: ContactBucket | 'all';
  limit?: number;
} = {}) {
  const bucket = params.bucket ?? 'all';
  const limit = params.limit ?? 50;
  return useInfiniteQuery({
    queryKey: ['contacts', 'today', { bucket, limit }],
    queryFn: ({ pageParam, signal }) => {
      const search = new URLSearchParams();
      search.set('bucket', bucket);
      search.set('offset', String(pageParam));
      search.set('limit', String(limit));
      return apiGet<ContactQueue>(`/api/contacts/today?${search.toString()}`, signal);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 15_000,
  });
}

export function useFollowUps(
  params: {
    tab?: string;
    status?: string;
    page?: number;
    limit?: number;
    responsible?: string;
    leadStatus?: string;
    state?: string;
  } = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const suffix = search.toString();
  return useQuery({
    queryKey: ['follow-ups', params],
    queryFn: ({ signal }) =>
      apiGet<FollowUpListResult>(`/api/follow-ups${suffix ? `?${suffix}` : ''}`, signal),
    staleTime: 15_000,
  });
}

export function usePatchFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      status?: string;
      scheduledFor?: string;
      note?: string | null;
    }) => apiPatch<SerializedFollowUp>(`/api/follow-ups/${id}`, input),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['follow-ups', 'contacts', 'dashboard', 'leads']);
    },
  });
}

export function useRecordInteraction(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInteractionInput) =>
      apiPost(`/api/leads/${leadId}/interactions`, input),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'contacts', 'follow-ups', 'dashboard']);
    },
  });
}

export function useInteractions(leadId: string) {
  return useQuery({
    queryKey: ['interactions', leadId],
    queryFn: ({ signal }) => apiGet(`/api/leads/${leadId}/interactions`, signal),
    staleTime: 15_000,
    enabled: Boolean(leadId),
  });
}
