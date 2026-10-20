/**
 * Ajuste de rede quando o worker roda no Compose.
 * Sem CRM_DOCKER_DB_HOST: Postgres nativo na máquina (host.docker.internal),
 * na mesma porta publicada.
 * Com CRM_DOCKER_DB_HOST (ex. crm-postgres): banco irmão no mesmo Compose. Aí
 * a porta também muda — dentro da rede do Compose vale a porta DO CONTAINER
 * (5432), não a publicada na máquina (CRM_DB_PORT, ex. 5442).
 * Não loga URL: tem senha.
 */

export const DOCKER_WORKER_FLAG = 'CRM_WORKER_IN_DOCKER';
export const DOCKER_DB_HOST_FLAG = 'CRM_DOCKER_DB_HOST';
export const DOCKER_DB_PORT_FLAG = 'CRM_DOCKER_DB_PORT';
export const DOCKER_REDIS_URL = 'redis://redis:6379';
/** Porta do Postgres dentro da rede do Compose. */
export const DOCKER_DB_PORT_DEFAULT = '5432';

export function rewriteDatabaseUrlForDocker(
  url: string,
  dockerDbHost?: string,
  dockerDbPort?: string,
): string {
  const sibling = (dockerDbHost ?? '').trim();
  const host = sibling || 'host.docker.internal';
  const rewritten = url
    .replace(/@127\.0\.0\.1(?=[:/])/g, `@${host}`)
    .replace(/@localhost(?=[:/])/gi, `@${host}`)
    .replace(/@\[::1\](?=[:/])/g, `@${host}`);

  // A porta só muda para o banco irmão: com host.docker.internal quem atende é
  // o Postgres da máquina, na porta que ele publica.
  if (!sibling) return rewritten;

  const port = (dockerDbPort ?? '').trim() || DOCKER_DB_PORT_DEFAULT;
  return rewritten.replace(
    new RegExp(`@${escapeForRegExp(host)}:\\d+(?=[/?]|$)`, 'g'),
    `@${host}:${port}`,
  );
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLoopbackRedis(url: string): boolean {
  return /127\.0\.0\.1|localhost|\[::1\]/i.test(url);
}

export function applyDockerWorkerEnv(env: NodeJS.ProcessEnv): void {
  if (env[DOCKER_WORKER_FLAG] !== '1') return;
  const db = env.DATABASE_URL;
  if (db) {
    env.DATABASE_URL = rewriteDatabaseUrlForDocker(
      db,
      env[DOCKER_DB_HOST_FLAG],
      env[DOCKER_DB_PORT_FLAG],
    );
  }
  if (!env.REDIS_URL || isLoopbackRedis(env.REDIS_URL)) {
    env.REDIS_URL = DOCKER_REDIS_URL;
  }
}
