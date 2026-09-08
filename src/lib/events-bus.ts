import type Redis from 'ioredis';

import { EVENTS_CHANNEL } from '@/lib/events';
import { getRedisSubscriber } from '@/lib/redis';

type Listener = (message: string) => void;

const globalForBus = globalThis as unknown as {
  crmEventListeners?: Set<Listener>;
  crmEventSubscriber?: Redis | null;
  crmEventHandlersAttached?: boolean;
};

function listeners(): Set<Listener> {
  if (!globalForBus.crmEventListeners) {
    globalForBus.crmEventListeners = new Set();
  }
  return globalForBus.crmEventListeners;
}

function fanout(message: string): void {
  for (const listener of listeners()) {
    listener(message);
  }
}

function subscribe(subscriber: Redis): void {
  void subscriber.subscribe(EVENTS_CHANNEL).catch((error: Error) => {
    console.error('[events] subscribe falhou:', error.message);
  });
}

/**
 * Um subscriber por processo. Cada SSE antigo abria Redis próprio e chamava
 * SUBSCRIBE antes do socket ficar `ready` (`enableOfflineQueue: false` → o
 * comando era descartado e as telas paravam de se falar).
 */
function bindSubscriber(subscriber: Redis): void {
  if (globalForBus.crmEventSubscriber !== subscriber) {
    globalForBus.crmEventSubscriber = subscriber;
    globalForBus.crmEventHandlersAttached = false;
  }
  if (globalForBus.crmEventHandlersAttached) {
    if (subscriber.status === 'ready') subscribe(subscriber);
    return;
  }

  subscriber.on('ready', () => subscribe(subscriber));
  subscriber.on('message', (channel: string, message: string) => {
    if (channel === EVENTS_CHANNEL) fanout(message);
  });
  globalForBus.crmEventHandlersAttached = true;
  if (subscriber.status === 'ready') subscribe(subscriber);
}

export function hasEventsRedis(): boolean {
  return getRedisSubscriber() !== null;
}

/** Liga o SSE local ao canal Redis. Não desconecta o subscriber no cancel. */
export function listenDomainEvents(onMessage: Listener): () => void {
  const subscriber = getRedisSubscriber();
  if (subscriber) bindSubscriber(subscriber);
  listeners().add(onMessage);
  return () => {
    listeners().delete(onMessage);
  };
}
