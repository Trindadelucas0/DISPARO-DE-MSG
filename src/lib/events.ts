import { CACHE_TAGS, invalidateTags } from '@/lib/cache';
import { getRedis, waitUntilRedisReady } from '@/lib/redis';

/** Canal único de fan-out. O cliente SSE escuta e invalida as query keys. */
export const EVENTS_CHANNEL = 'crm:events';

export interface DomainEvent {
  readonly type: string;
  readonly tags: readonly string[];
  readonly entityId?: string | null;
  readonly at: string;
}

export async function publishEvent(event: Omit<DomainEvent, 'at'>): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  if (redis.status !== 'ready') {
    const ready = await waitUntilRedisReady(2000);
    if (!ready) return;
  }
  try {
    const payload: DomainEvent = { ...event, at: new Date().toISOString() };
    await redis.publish(EVENTS_CHANNEL, JSON.stringify(payload));
  } catch (error) {
    console.error('[events] publish falhou:', (error as Error).message);
  }
}

/** Invalida cache e avisa os clientes. Chamado depois de toda mutação. */
export async function notifyChange(event: Omit<DomainEvent, 'at'>): Promise<void> {
  await invalidateTags(...event.tags);
  await publishEvent(event);
}

export const MUTATION_TAGS = {
  lead: (id: string) => [
    CACHE_TAGS.leads,
    CACHE_TAGS.lead(id),
    CACHE_TAGS.dashboard,
    CACHE_TAGS.contacts,
    CACHE_TAGS.reports,
  ],
  leadsBulk: [
    CACHE_TAGS.leads,
    CACHE_TAGS.dashboard,
    CACHE_TAGS.contacts,
    CACHE_TAGS.reports,
  ],
  followUp: [
    CACHE_TAGS.followUps,
    CACHE_TAGS.contacts,
    CACHE_TAGS.dashboard,
    CACHE_TAGS.leads,
  ],
  template: [CACHE_TAGS.templates],
  users: [CACHE_TAGS.users],
  campaign: [CACHE_TAGS.campaigns, CACHE_TAGS.dashboard],
  conversation: [CACHE_TAGS.conversations],
  whatsapp: [CACHE_TAGS.whatsapp, CACHE_TAGS.campaigns],
} as const;
