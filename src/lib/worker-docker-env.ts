/**
 * Ajuste de rede quando o worker roda no Compose (Linux) e o Postgres
 * continua nativo na máquina. Não loga URL: tem senha.
 */

export const DOCKER_WORKER_FLAG = 'CRM_WORKER_IN_DOCKER';
export const DOCKER_REDIS_URL = 'redis://redis:6379';

export function rewriteDatabaseUrlForDocker(url: string): string {
  return url
    .replace(/@127\.0\.0\.1(?=[:/])/g, '@host.docker.internal')
    .replace(/@localhost(?=[:/])/gi, '@host.docker.internal')
    .replace(/@\[::1\](?=[:/])/g, '@host.docker.internal');
}

function isLoopbackRedis(url: string): boolean {
  return /127\.0\.0\.1|localhost|\[::1\]/i.test(url);
}

export function applyDockerWorkerEnv(env: NodeJS.ProcessEnv): void {
  if (env[DOCKER_WORKER_FLAG] !== '1') return;
  const db = env.DATABASE_URL;
  if (db) {
    env.DATABASE_URL = rewriteDatabaseUrlForDocker(db);
  }
  if (!env.REDIS_URL || isLoopbackRedis(env.REDIS_URL)) {
    env.REDIS_URL = DOCKER_REDIS_URL;
  }
}
