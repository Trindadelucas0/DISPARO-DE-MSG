'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InboxFilter } from '@/constants/conversation';
import { invalidateClientTags } from '@/features/events/invalidate-client';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { SerializedConversation } from '@/server/services/conversation.service';
import type { SerializedMedia } from '@/server/services/media.service';

export type InboxMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  kind: string;
  body: string;
  status: string;
  media: SerializedMedia | null;
  createdAt: string;
};

export const inboxKeys = {
  list: (filter: string, search: string, page: number) =>
    ['conversations', 'list', filter, search, page] as const,
  detail: (id: string) => ['conversations', 'detail', id] as const,
  messages: (id: string) => ['conversations', 'messages', id] as const,
};

export function useConversationList(filter: InboxFilter, search: string, page = 1) {
  const params = new URLSearchParams({
    filter,
    page: String(page),
    limit: '40',
  });
  if (search.trim()) params.set('search', search.trim());
  return useQuery({
    queryKey: inboxKeys.list(filter, search, page),
    queryFn: ({ signal }) =>
      apiGet<{ total: number; rows: SerializedConversation[] }>(
        `/api/conversations?${params}`,
        signal,
      ),
    staleTime: 15_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: inboxKeys.detail(id ?? ''),
    queryFn: ({ signal }) => apiGet<SerializedConversation>(`/api/conversations/${id}`, signal),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useConversationMessages(id: string | null) {
  return useQuery({
    queryKey: inboxKeys.messages(id ?? ''),
    queryFn: ({ signal }) =>
      apiGet<InboxMessage[]>(`/api/conversations/${id}/messages`, signal),
    enabled: Boolean(id),
    staleTime: 5_000,
  });
}

function invalidateInbox(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  invalidateClientTags(queryClient, ['conversations']);
  if (id) {
    void queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: inboxKeys.messages(id) });
  }
}

export function useInboxActions(conversationId: string | null) {
  const queryClient = useQueryClient();
  const id = conversationId ?? '';

  const send = useMutation({
    mutationFn: (body: { body?: string; mediaId?: string; templateId?: string }) =>
      apiPost(`/api/conversations/${id}/messages`, body),
    onSuccess: () => {
      invalidateInbox(queryClient, id);
      invalidateClientTags(queryClient, ['whatsapp', 'leads']);
    },
  });
  const take = useMutation({
    mutationFn: () => apiPost(`/api/conversations/${id}/take`),
    onSuccess: () => invalidateInbox(queryClient, id),
  });
  const transfer = useMutation({
    mutationFn: (body: { toUserId: string; note?: string }) => {
      // #region agent log
      fetch('http://127.0.0.1:7573/ingest/168a1e45-0a27-4a12-9ec9-dabfa1ec792b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da6cd6' },
        body: JSON.stringify({
          sessionId: 'da6cd6',
          runId: 'post-fix',
          hypothesisId: 'D',
          location: 'use-inbox.ts:transfer',
          message: 'client transfer mutate',
          data: { conversationId: id, toUserId: body.toUserId, idEmpty: !id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return apiPost(`/api/conversations/${id}/transfer`, body);
    },
    onSuccess: () => invalidateInbox(queryClient, id),
  });
  const resolve = useMutation({
    mutationFn: () => apiPost(`/api/conversations/${id}/resolve`),
    onSuccess: () => invalidateInbox(queryClient, id),
  });
  const reopen = useMutation({
    mutationFn: () => apiPost(`/api/conversations/${id}/reopen`),
    onSuccess: () => invalidateInbox(queryClient, id),
  });
  const markRead = useMutation({
    mutationFn: () => apiPatch(`/api/conversations/${id}`),
    onSuccess: () => invalidateInbox(queryClient, id),
  });
  const attachContact = useMutation({
    mutationFn: (body: { name: string; whatsapp?: string; cnpj?: string }) =>
      apiPost<SerializedConversation>(`/api/conversations/${id}/contact`, body),
    onSuccess: (conversation) => {
      queryClient.setQueryData(inboxKeys.detail(id), conversation);
      queryClient.setQueriesData<{ total: number; rows: SerializedConversation[] }>(
        { queryKey: ['conversations', 'list'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            rows: old.rows.map((row) => (row.id === conversation.id ? conversation : row)),
          };
        },
      );
      invalidateInbox(queryClient, id);
      invalidateClientTags(queryClient, ['leads', 'dashboard', 'contacts', 'reports']);
    },
  });
  const changeLeadStatus = useMutation({
    mutationFn: (body: { status: string }) =>
      apiPatch(`/api/conversations/${id}/lead-status`, body),
    onSuccess: () => {
      invalidateInbox(queryClient, id);
      invalidateClientTags(queryClient, ['leads', 'dashboard', 'contacts', 'reports']);
    },
  });

  return { send, take, transfer, resolve, reopen, markRead, attachContact, changeLeadStatus };
}
