'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import type { LeadFilters } from '@/features/leads/schema';
import { defaultLeadFilters } from '@/features/leads/filter-model';
import { filtersToSearchParams } from '@/features/leads/query';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { SerializedCampaign } from '@/server/services/campaign.service';

export type CampaignPatchBody = {
  name?: string;
  audienceFilter?: LeadFilters;
  excludeOptOut?: boolean;
  recipientLimit?: number | null;
  routingMode?: string;
  templateId?: string | null;
  followUpTemplateId?: string | null;
  followUpDelayHours?: number;
  whatsappAccountId?: string | null;
};

export type CampaignWhatsAppAccount = {
  id: string;
  name: string;
  provider: string;
  sessionStatus: string;
};

export const campaignKeys = {
  list: () => ['campaigns', 'list'] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
  metrics: (id: string) => ['campaigns', 'metrics', id] as const,
  recipients: (id: string, page: number, status?: string) =>
    ['campaigns', 'recipients', id, page, status ?? ''] as const,
  audience: (filters: LeadFilters, excludeOptOut: boolean) =>
    ['campaigns', 'audience', filters, excludeOptOut] as const,
  accounts: () => ['whatsapp', 'accounts', 'campaign'] as const,
};

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.list(),
    queryFn: ({ signal }) => apiGet<SerializedCampaign[]>('/api/campaigns', signal),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: ({ signal }) => apiGet<SerializedCampaign>(`/api/campaigns/${id}`, signal),
    enabled: Boolean(id),
  });
}

export function useCampaignMetrics(id: string) {
  return useQuery({
    queryKey: campaignKeys.metrics(id),
    queryFn: ({ signal }) =>
      apiGet<Record<string, number>>(`/api/campaigns/${id}/metrics`, signal),
    enabled: Boolean(id),
  });
}

export function useCampaignWhatsAppAccounts() {
  return useQuery({
    queryKey: campaignKeys.accounts(),
    queryFn: ({ signal }) =>
      apiGet<CampaignWhatsAppAccount[]>('/api/whatsapp/accounts', signal),
    staleTime: 5_000,
    refetchInterval: 8_000,
  });
}

export function useCampaignAudience(filters: LeadFilters, excludeOptOut: boolean, enabled: boolean) {
  const params = filtersToSearchParams(filters);
  params.set('excludeOptOut', String(excludeOptOut));
  return useQuery({
    queryKey: campaignKeys.audience(filters, excludeOptOut),
    queryFn: ({ signal }) =>
      apiGet<{
        found: number;
        withWhatsapp: number;
        withoutWhatsapp: number;
        optOut: number;
        sample: {
          id: string;
          razaoSocial: string;
          cnpj: string;
          cidade: string | null;
          estado: string | null;
          origem: string | null;
          whatsapp: string | null;
          status: string;
        }[];
      }>(`/api/campaigns/audience?${params}`, signal),
    enabled,
    staleTime: 20_000,
  });
}

export function useCampaignMutations(id?: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    invalidateClientTags(queryClient, ['campaigns', 'dashboard']);
  };

  return {
    create: useMutation({
      mutationFn: (name: string) => apiPost<SerializedCampaign>('/api/campaigns', { name }),
      onSuccess: invalidate,
    }),
    createFromLeads: useMutation({
      mutationFn: async (input: { name: string; ids: string[] }) => {
        const campaign = await apiPost<SerializedCampaign>('/api/campaigns', { name: input.name });
        return apiPatch<SerializedCampaign>(`/api/campaigns/${campaign.id}`, {
          audienceFilter: { ...defaultLeadFilters(), ids: input.ids },
        });
      },
      onSuccess: invalidate,
    }),
    patch: useMutation({
      mutationFn: (body: CampaignPatchBody) =>
        apiPatch<SerializedCampaign>(`/api/campaigns/${id}`, body),
      onSuccess: invalidate,
    }),
    start: useMutation({
      mutationFn: () => apiPost<SerializedCampaign>(`/api/campaigns/${id}/start`),
      onSettled: invalidate,
    }),
    pause: useMutation({
      mutationFn: () => apiPost<SerializedCampaign>(`/api/campaigns/${id}/pause`),
      onSuccess: invalidate,
    }),
    resume: useMutation({
      mutationFn: () => apiPost<SerializedCampaign>(`/api/campaigns/${id}/resume`),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: () => apiPost<SerializedCampaign>(`/api/campaigns/${id}/cancel`),
      onSuccess: invalidate,
    }),
    followUp: useMutation({
      mutationFn: () => apiPost<SerializedCampaign>(`/api/campaigns/${id}/follow-up`),
      onSettled: invalidate,
    }),
    addRecipients: useMutation({
      mutationFn: (count: number) =>
        apiPost<SerializedCampaign>(`/api/campaigns/${id}/recipients`, { count }),
      onSettled: invalidate,
    }),
  };
}
