/**
 * Ajuste de rede quando o worker roda no Compose.
 * Sem CRM_DOCKER_DB_HOST: Postgres nativo na máquina (host.docker.internal).
 * Com CRM_DOCKER_DB_HOST (ex. crm-postgres): banco irmão no mesmo Compose.
 * Não loga URL: tem senha.
 */

export const DOCKER_WORKER_FLAG = 'CRM_WORKER_IN_DOCKER';
export const DOCKER_DB_HOST_FLAG = 'CRM_DOCKER_DB_HOST';
export const DOCKER_REDIS_URL = 'redis://redis:6379';

export function rewriteDatabaseUrlForDocker(
  url: string,
  dockerDbHost?: string,
): string {
  const host = (dockerDbHost ?? '').trim() || 'host.docker.internal';
  return url
    .replace(/@127\.0\.0\.1(?=[:/])/g, `@${host}`)
    .replace(/@localhost(?=[:/])/gi, `@${host}`)
    .replace(/@\[::1\](?=[:/])/g, `@${host}`);
}

function isLoopbackRedis(url: string): boolean {
  return /127\.0\.0\.1|localhost|\[::1\]/i.test(url);
}

export function applyDockerWorkerEnv(env: NodeJS.ProcessEnv): void {
  if (env[DOCKER_WORKER_FLAG] !== '1') return;
  const db = env.DATABASE_URL;
  if (db) {
    env.DATABASE_URL = rewriteDatabaseUrlForDocker(db, env[DOCKER_DB_HOST_FLAG]);
  }
  if (!env.REDIS_URL || isLoopbackRedis(env.REDIS_URL)) {
    env.REDIS_URL = DOCKER_REDIS_URL;
  }
}
