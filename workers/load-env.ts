import { config } from 'dotenv';

import { applyDockerWorkerEnv } from '@/lib/worker-docker-env';

config();
applyDockerWorkerEnv(process.env);
