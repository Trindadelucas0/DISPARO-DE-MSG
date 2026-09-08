import Redis from 'ioredis';

/**
 * Conexão Redis opcional.
 *
 * Sem REDIS_URL o sistema continua funcionando: cache vira no-op e rate limit
 * degrada para "permitir" (ver src/lib/rate-limit). Isso é deliberado — Redis é
 * otimização de leitura, não requisito de correção.
 *
 * Se o Redis estiver desligado no boot, o cliente antigo desistia de reconectar.
 * Agora recria a conexão quando o socket morreu, para o QR voltar a funcionar
 * depois de `docker start crm-redis` sem reiniciar o Next.
 */

const globalForRedis = globalThis as unknown as {
  redis?: Redis | null;
  redisSubscriber?: Redis | null;
};

let warnedUnavailable = false;

function isDead(client: Redis | null | undefined): boolean {
  return client != null && (client.status === 'end' || client.status === 'close');
}

function createClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[redis] REDIS_URL ausente: cache e rate limit desligados.');
    }
    return null;
  }

  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 300, 3000);
    },
  });

  client.on('error', (error: Error) => {
    // Sem isso o ioredis emite unhandled error e derruba o processo.
    console.error('[redis] erro de conexão:', error.message);
  });

  return client;
}

export function getRedis(): Redis | null {
  if (isDead(globalForRedis.redis)) {
    try {
      globalForRedis.redis?.disconnect();
    } catch {
      /* já fechou */
    }
    globalForRedis.redis = undefined;
  }
  if (globalForRedis.redis === undefined) {
    globalForRedis.redis = createClient();
  }
  return globalForRedis.redis;
}

export function isRedisAvailable(): boolean {
  const client = getRedis();
  return client !== null && client.status === 'ready';
}

/**
 * Conexão só de subscribe. O ioredis em modo subscriber não aceita outros
 * comandos; misturar com o cliente de cache quebraria get/set.
 */
export function getRedisSubscriber(): Redis | null {
  if (isDead(globalForRedis.redisSubscriber)) {
    try {
      globalForRedis.redisSubscriber?.disconnect();
    } catch {
      /* já fechou */
    }
    globalForRedis.redisSubscriber = undefined;
  }
  if (globalForRedis.redisSubscriber !== undefined) {
    return globalForRedis.redisSubscriber;
  }
  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.redisSubscriber = null;
    return null;
  }
  const subscriber = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 300, 3000);
    },
  });
  subscriber.on('error', (error: Error) => {
    console.error('[redis] subscriber erro:', error.message);
  });
  globalForRedis.redisSubscriber = subscriber;
  return subscriber;
}

/** Espera o cliente de cache ficar `ready`. Sem isso o publish SSE some no boot. */
export async function waitUntilRedisReady(timeoutMs = 2000): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  if (redis.status === 'ready') return true;

  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      redis.off('ready', onReady);
      resolve(ok);
    };
    const timer = setTimeout(() => done(redis.status === 'ready'), timeoutMs);
    const onReady = () => done(true);
    redis.once('ready', onReady);
    if (redis.status === 'ready') done(true);
  });
}

/**
 * Fecha a conexão. Obrigatório em processo de vida curta (CLI, seed): o socket
 * aberto do ioredis mantém o event loop vivo e o processo nunca encerra.
 * O servidor Next não chama isto — a conexão vive junto do processo.
 */
export async function closeRedis(): Promise<void> {
  const client = globalForRedis.redis;
  if (!client) return;
  globalForRedis.redis = undefined;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
