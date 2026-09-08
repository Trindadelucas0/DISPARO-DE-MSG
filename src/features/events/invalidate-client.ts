'use client';

import type { QueryClient } from '@tanstack/react-query';

import { queryKeysForEventTags } from '@/lib/event-query-keys';

/** Invalida as telas ligadas às tags do evento — mesma aba, sem esperar SSE. */
export function invalidateClientTags(
  queryClient: QueryClient,
  tags: readonly string[],
): void {
  for (const queryKey of queryKeysForEventTags(tags)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
