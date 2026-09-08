'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import type { DomainEvent } from '@/lib/events';
import { consumeSse } from '@/lib/events-sse';

/** Um abort para o HMR não deixar fetch antigo reconectando. */
let bridgeAbort: AbortController | null = null;

/**
 * Escuta `/api/events` via fetch (mesmo cookie das outras APIs).
 * Sem sessão o servidor manda `idle` (200), não 401 — 401 em loop lotava o terminal.
 */
export function EventsBridge() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    bridgeAbort?.abort();
    const abort = new AbortController();
    bridgeAbort = abort;

    const invalidate = (event: DomainEvent) => {
      invalidateClientTags(queryClient, event.tags);
    };

    const schedule = (ms: number) => {
      if (stopped) return;
      retry = setTimeout(() => {
        void connect();
      }, ms);
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const response = await fetch('/api/events', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'text/event-stream' },
          signal: abort.signal,
        });
        if (response.status === 401) {
          schedule(30_000);
          return;
        }
        if (!response.ok || !response.body) {
          schedule(8_000);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let idle = false;
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const consumed = consumeSse(buffer);
          buffer = consumed.rest;
          for (const frame of consumed.frames) {
            if (frame.event === 'idle') {
              idle = true;
              continue;
            }
            if (frame.event !== 'change' || !frame.data) continue;
            try {
              invalidate(JSON.parse(frame.data) as DomainEvent);
            } catch {
              // payload inválido não derruba a sessão
            }
          }
        }
        if (!stopped) schedule(idle ? 30_000 : 4_000);
      } catch (error) {
        if (stopped) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        schedule(8_000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      abort.abort();
      if (bridgeAbort === abort) bridgeAbort = null;
    };
  }, [queryClient]);

  return null;
}
