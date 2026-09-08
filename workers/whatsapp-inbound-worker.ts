import { Worker } from 'bullmq';

import { createBullConnection } from '@/server/queue/connection';
import { QUEUE_NAMES, type WhatsappInboundJob } from '@/server/queue/names';
import { processWhatsappInboundJob } from '@/server/queue/processors/whatsapp-inbound';

export function startWhatsappInboundWorker() {
  const worker = new Worker<WhatsappInboundJob>(
    QUEUE_NAMES.whatsappInbound,
    async (job) => {
      await processWhatsappInboundJob(job.data);
    },
    { connection: createBullConnection(), concurrency: 10 },
  );
  worker.on('failed', (job, error) => {
    console.error('[worker:whatsapp-inbound]', job?.id, error.message);
  });
  return worker;
}
