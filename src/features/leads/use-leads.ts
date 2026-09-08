'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import type { LeadFilters, LeadUpdateInput } from '@/features/leads/schema';
import { leadsApiUrl } from '@/features/leads/query';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { LeadFacets, LeadListResult, SerializedLeadDetail } from '@/server/services/lead.service';
import type { BulkLeadResult } from '@/features/leads/bulk-schema';

/**
 * Acesso a dados das telas de lead. Componente não chama `fetch` direto e
 * serviço nunca é importado por componente: a fronteira é a API HTTP.
 */

export const leadKeys = {
  list: (filters: LeadFilters) => ['leads', 'list', filters] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
  facets: () => ['leads', 'facets'] as const,
};

export function useLeadList(filters: LeadFilters) {
  return useQuery({
    queryKey: leadKeys.list(filters),
    queryFn: ({ signal }) => apiGet<LeadListResult>(leadsApiUrl(filters), signal),
    // Lista de trabalho: 30s é o suficiente para paginar sem refetch a cada
    // clique, e curto o bastante para não mostrar status vencido.
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useLeadFacets() {
  return useQuery({
    queryKey: leadKeys.facets(),
    queryFn: ({ signal }) => apiGet<LeadFacets>('/api/leads/facets', signal),
    staleTime: 5 * 60_000,
  });
}

export function useLead(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: ({ signal }) => apiGet<SerializedLeadDetail>(`/api/leads/${id}`, signal),
    staleTime: 30_000,
    enabled: options.enabled ?? Boolean(id),
  });
}

export function useUpdateLead(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LeadUpdateInput) => apiPatch<SerializedLeadDetail>(`/api/leads/${id}`, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(leadKeys.detail(id), updated);
      invalidateClientTags(queryClient, ['leads', 'dashboard', 'contacts', 'reports']);
    },
  });
}

export function useBulkUpdateLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { ids: string[]; status?: string; responsavelId?: string | null }) =>
      apiPost<BulkLeadResult>('/api/leads/bulk', input),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'dashboard', 'contacts', 'reports']);
    },
  });
}

export function useBulkTagLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; tagId: string; action: 'add' | 'remove' }) =>
      apiPost<BulkLeadResult>('/api/leads/bulk/tags', input),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'dashboard', 'contacts', 'reports']);
    },
  });
}

export function useCreateManualLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; whatsapp?: string; cnpj?: string }) =>
      apiPost<{ id: string; cnpj: string; razaoSocial: string; created: boolean }>(
        '/api/leads',
        input,
      ),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'campaigns', 'dashboard', 'contacts', 'reports']);
    },
  });
}

export function useBulkFollowUpLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; scheduledFor: string; note?: string | null }) =>
      apiPost<BulkLeadResult>('/api/leads/bulk/follow-ups', input),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'follow-ups', 'contacts', 'dashboard']);
    },
  });
}
