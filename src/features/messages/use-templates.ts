'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '@/lib/api-client';
import { pickConnectedSendableAccount } from '@/constants/whatsapp';
import { idbGet, idbSet, IDB_KEYS } from '@/lib/idb';
import type { SerializedTemplate } from '@/server/services/template.service';
import type { SerializedMedia } from '@/server/services/media.service';
import type { LeadWhatsappSendResponse } from '@/features/messages/whatsapp-send';

export function useTemplates(activeOnly = false) {
  return useQuery({
    queryKey: ['templates', { activeOnly }],
    queryFn: async ({ signal }) => {
      const rows = await apiGet<SerializedTemplate[]>(
        `/api/templates${activeOnly ? '?active=1' : ''}`,
        signal,
      );
      void idbSet(IDB_KEYS.templatesCache, rows);
      return rows;
    },
    staleTime: 5 * 60_000,
    placeholderData: () => undefined,
    initialData: () => undefined,
  });
}

export function usePrefetchTemplatesFromIdb() {
  return useQuery({
    queryKey: ['templates', 'idb'],
    queryFn: () => idbGet<SerializedTemplate[]>(IDB_KEYS.templatesCache),
    staleTime: Infinity,
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      channel: string;
      subject?: string | null;
      body: string;
      active?: boolean;
      mediaId?: string | null;
    }) => {
      if (input.id) {
        return apiPatch<SerializedTemplate>(`/api/templates/${input.id}`, input);
      }
      return apiPost<SerializedTemplate>('/api/templates', input);
    },
    onSuccess: () => {
      invalidateClientTags(queryClient, ['templates']);
    },
  });
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: (file: File) => apiUpload<SerializedMedia>('/api/media', file),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/templates/${id}`),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['templates']);
    },
  });
}

export function useHasConnectedWhatsApp() {
  return useQuery({
    queryKey: ['whatsapp', 'accounts'],
    queryFn: ({ signal }) =>
      apiGet<Array<{ provider: string; sessionStatus: string }>>('/api/whatsapp/accounts', signal),
    staleTime: 5_000,
    refetchInterval: 8_000,
    select: (rows) => Boolean(pickConnectedSendableAccount(rows)),
  });
}

export function useSendWhatsapp(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { templateId?: string | null; content: string }) =>
      apiPost<LeadWhatsappSendResponse>(`/api/leads/${leadId}/whatsapp`, input),
    onSuccess: () => {
      invalidateClientTags(queryClient, [
        'leads',
        'contacts',
        'follow-ups',
        'dashboard',
        'conversations',
        'whatsapp',
      ]);
    },
  });
}

export function usePatchInteraction(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      interactionId,
      ...input
    }: {
      interactionId: string;
      result?: string;
      type?: string;
      scheduledFor?: string | null;
      note?: string | null;
      content?: string | null;
    }) => apiPatch(`/api/leads/${leadId}/interactions/${interactionId}`, { type: 'WHATSAPP', ...input }),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['leads', 'contacts', 'follow-ups', 'dashboard']);
    },
  });
}
