import { Worker } from 'bullmq';

import { campaignSendIntervalMs } from '@/constants/campaign';
import { createBullConnection } from '@/server/queue/connection';
import { QUEUE_NAMES, type CampaignSendJob } from '@/server/queue/names';
import { processCampaignSendJob } from '@/server/queue/processors/campaign-send';
import { campaignSafetyWaitMs } from '@/server/services/campaign-safety.service';

/** Uma fila de verdade: retry, se um dia for usado, deve voltar para campaign-send. */
const CAMPAIGN_SEND_WORKER_LIMIT = {
  concurrency: 1,
  limiter: { max: 1, duration: campaignSendIntervalMs() },
} as const;

export function startCampaignWorkers() {
  const connection = createBullConnection();

  const send = new Worker<CampaignSendJob>(
    QUEUE_NAMES.campaignSend,
    async (job) => {
      const waitMs = await campaignSafetyWaitMs(job.data);
      if (waitMs > 0) {
        await send.rateLimit(waitMs);
        throw Worker.RateLimitError();
      }
      await processCampaignSendJob(job.data);
    },
    { connection, ...CAMPAIGN_SEND_WORKER_LIMIT },
  );

  send.on('failed', (job, error) => {
    console.error('[worker:campaign-send]', job?.id, error.message);
  });

  return { send };
}
