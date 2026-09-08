import { Worker } from 'bullmq';

import { createBullConnection } from '@/server/queue/connection';
import { QUEUE_NAMES, type WhatsappStatusJob } from '@/server/queue/names';
import { processWhatsappStatusJob } from '@/server/queue/processors/whatsapp-status';

export function startWhatsappStatusWorker() {
  const worker = new Worker<WhatsappStatusJob>(
    QUEUE_NAMES.whatsappStatus,
    async (job) => {
      await processWhatsappStatusJob(job.data);
    },
    { connection: createBullConnection(), concurrency: 10 },
  );
  worker.on('failed', (job, error) => {
    console.error('[worker:whatsapp-status]', job?.id, error.message);
  });
  return worker;
}
