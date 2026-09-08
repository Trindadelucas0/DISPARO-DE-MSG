import Redis from 'ioredis';

/**
 * Conexão Redis exclusiva do BullMQ.
 * BullMQ exige `maxRetriesPerRequest: null` — a conexão de cache do app
 * (`src/lib/redis`) não serve para workers.
 */

let shared: Redis | null | undefined;

export function getBullRedisUrl(): string | null {
  return process.env.REDIS_URL ?? null;
}

export function createBullConnection(): Redis {
  const url = getBullRedisUrl();
  if (!url) {
    throw new Error('REDIS_URL ausente. Filas de campanha e WhatsApp exigem Redis.');
  }
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function getSharedBullConnection(): Redis {
  if (shared) return shared;
  shared = createBullConnection();
  shared.on('error', (error: Error) => {
    console.error('[bullmq] redis:', error.message);
  });
  return shared;
}

export async function closeSharedBullConnection(): Promise<void> {
  if (!shared) return;
  const client = shared;
  shared = null;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

export function isBullRedisConfigured(): boolean {
  return Boolean(getBullRedisUrl());
}
