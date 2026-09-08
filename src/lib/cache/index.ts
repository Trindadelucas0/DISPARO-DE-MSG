import { createHash } from 'node:crypto';

import { getRedis } from '@/lib/redis';

/**
 * Cache de leitura sobre Redis com invalidação por tag.
 *
 * Contrato: se o Redis não estiver disponível, `getOrSet` executa a função e
 * devolve o resultado. Cache indisponível nunca é erro para o usuário.
 *
 * Tag → conjunto de chaves. Uma escrita invalida a tag, não a chave, porque a
 * chave carrega o hash do filtro e o escritor não conhece os filtros dos leitores.
 */

const KEY_PREFIX = 'crm:cache:';
const TAG_PREFIX = 'crm:tag:';

export const CACHE_TAGS = {
  leads: 'leads',
  lead: (id: string) => `lead:${id}`,
  dashboard: 'dashboard',
  followUps: 'follow-ups',
  templates: 'templates',
  tags: 'tags',
  importJobs: 'import-jobs',
  contacts: 'contacts',
  reports: 'reports',
  users: 'users',
  campaigns: 'campaigns',
  conversations: 'conversations',
  whatsapp: 'whatsapp',
} as const;

export const CACHE_TTL = {
  /** Lista de leads: janela curta, a tabela é o que mais muda. */
  leadList: 45,
  leadDetail: 60,
  dashboard: 60,
  reference: 300,
} as const;

/** Chave estável a partir de um objeto de filtro, independente da ordem das chaves. */
export function filterHash(input: unknown): string {
  const json = JSON.stringify(input, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return value;
  });
  return createHash('sha1').update(json ?? 'null').digest('hex').slice(0, 16);
}

export function cacheKey(namespace: string, discriminator: string): string {
  return `${KEY_PREFIX}${namespace}:${discriminator}`;
}

interface GetOrSetOptions {
  readonly tags?: readonly string[];
}

export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
  options: GetOrSetOptions = {},
): Promise<T> {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') {
    return producer();
  }

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    console.error('[cache] leitura falhou, seguindo sem cache:', (error as Error).message);
    return producer();
  }

  const value = await producer();

  try {
    const pipeline = redis.pipeline();
    pipeline.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    for (const tag of options.tags ?? []) {
      pipeline.sadd(`${TAG_PREFIX}${tag}`, key);
      // A tag expira depois da chave mais longa que ela guarda, para não vazar.
      pipeline.expire(`${TAG_PREFIX}${tag}`, ttlSeconds * 4);
    }
    await pipeline.exec();
  } catch (error) {
    console.error('[cache] gravação falhou, valor devolvido sem cachear:', (error as Error).message);
  }

  return value;
}

export async function invalidateTags(...tags: readonly string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready' || tags.length === 0) return;

  try {
    for (const tag of tags) {
      const tagKey = `${TAG_PREFIX}${tag}`;
      const keys = await redis.smembers(tagKey);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del(tagKey);
    }
  } catch (error) {
    console.error('[cache] invalidação falhou:', (error as Error).message);
  }
}
