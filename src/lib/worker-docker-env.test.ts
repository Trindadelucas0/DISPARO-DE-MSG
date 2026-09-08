import { describe, expect, it } from 'vitest';

import {
  applyDockerWorkerEnv,
  DOCKER_REDIS_URL,
  rewriteDatabaseUrlForDocker,
} from '@/lib/worker-docker-env';

describe('rewriteDatabaseUrlForDocker', () => {
  it('troca 127.0.0.1 pelo host da máquina', () => {
    expect(
      rewriteDatabaseUrlForDocker(
        'postgresql://u:s3nh@a@127.0.0.1:5432/crm_prospeccao?schema=public',
      ),
    ).toBe('postgresql://u:s3nh@a@host.docker.internal:5432/crm_prospeccao?schema=public');
  });

  it('troca localhost sem mexer no resto da URL', () => {
    expect(rewriteDatabaseUrlForDocker('postgresql://u:p@localhost:5432/crm')).toBe(
      'postgresql://u:p@host.docker.internal:5432/crm',
    );
  });

  it('não altera host já apontando para a máquina', () => {
    const url = 'postgresql://u:p@host.docker.internal:5432/crm';
    expect(rewriteDatabaseUrlForDocker(url)).toBe(url);
  });

  it('troca loopback pelo host do container irmão quando informado', () => {
    expect(
      rewriteDatabaseUrlForDocker(
        'postgresql://u:p@127.0.0.1:5432/crm',
        'crm-postgres',
      ),
    ).toBe('postgresql://u:p@crm-postgres:5432/crm');
  });
});

describe('applyDockerWorkerEnv', () => {
  it('não mexe nas variáveis fora do container', () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/crm',
      REDIS_URL: 'redis://127.0.0.1:6380',
    };
    applyDockerWorkerEnv(env);
    expect(env.DATABASE_URL).toBe('postgresql://u:p@127.0.0.1:5432/crm');
    expect(env.REDIS_URL).toBe('redis://127.0.0.1:6380');
  });

  it('no Compose aponta Postgres para o host e Redis para o serviço', () => {
    const env: NodeJS.ProcessEnv = {
      CRM_WORKER_IN_DOCKER: '1',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/crm',
      REDIS_URL: 'redis://127.0.0.1:6380',
    };
    applyDockerWorkerEnv(env);
    expect(env.DATABASE_URL).toBe('postgresql://u:p@host.docker.internal:5432/crm');
    expect(env.REDIS_URL).toBe(DOCKER_REDIS_URL);
  });

  it('no Compose com Postgres irmão usa CRM_DOCKER_DB_HOST', () => {
    const env: NodeJS.ProcessEnv = {
      CRM_WORKER_IN_DOCKER: '1',
      CRM_DOCKER_DB_HOST: 'crm-postgres',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/crm',
      REDIS_URL: 'redis://127.0.0.1:6380',
    };
    applyDockerWorkerEnv(env);
    expect(env.DATABASE_URL).toBe('postgresql://u:p@crm-postgres:5432/crm');
  });
});
