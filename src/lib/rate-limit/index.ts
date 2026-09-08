import { getRedis } from '@/lib/redis';

/**
 * Sliding window no Redis.
 *
 * Aplicado no login e nos endpoints de importação/exportação. Sem Redis a
 * função libera a requisição e registra aviso: preferimos operar sem limite a
 * bloquear o sistema por causa de uma dependência de infraestrutura ausente.
 * Isso é uma decisão de disponibilidade e está declarada em DOCUMENTACAO-SISTEMA.md.
 */

const PREFIX = 'crm:rl:';

export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 300 },
  import: { limit: 5, windowSeconds: 600 },
  export: { limit: 10, windowSeconds: 600 },
  writeHeavy: { limit: 60, windowSeconds: 60 },
  campaignStart: { limit: 8, windowSeconds: 600 },
  webhook: { limit: 120, windowSeconds: 60 },
  mediaUpload: { limit: 20, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
  /** Verdadeiro quando o Redis não respondeu e a requisição passou por omissão. */
  readonly degraded: boolean;
}

export async function checkRateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') {
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, degraded: true };
  }

  const key = `${PREFIX}${bucket}:${identifier}`;
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);
    const results = await pipeline.exec();

    const countEntry = results?.[2];
    const count = typeof countEntry?.[1] === 'number' ? countEntry[1] : 0;

    if (count > rule.limit) {
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestScore = oldest[1] ? Number(oldest[1]) : now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds, degraded: false };
    }

    return {
      allowed: true,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: 0,
      degraded: false,
    };
  } catch (error) {
    console.error('[rate-limit] falhou, liberando requisição:', (error as Error).message);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, degraded: true };
  }
}

/** IP do cliente atrás de proxy. Cai para 'unknown' em vez de aceitar valor forjado como confiável. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
