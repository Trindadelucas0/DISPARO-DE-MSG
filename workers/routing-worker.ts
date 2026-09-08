import { Worker } from 'bullmq';

import { createBullConnection } from '@/server/queue/connection';
import { QUEUE_NAMES, type ConversationRoutingJob } from '@/server/queue/names';
import { processConversationRoutingJob } from '@/server/queue/processors/conversation-routing';

export function startRoutingWorker() {
  const worker = new Worker<ConversationRoutingJob>(
    QUEUE_NAMES.conversationRouting,
    async (job) => {
      await processConversationRoutingJob(job.data);
    },
    { connection: createBullConnection(), concurrency: 5 },
  );
  worker.on('failed', (job, error) => {
    console.error('[worker:routing]', job?.id, error.message);
  });
  return worker;
}
