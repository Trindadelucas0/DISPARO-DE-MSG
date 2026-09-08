import { Queue } from 'bullmq';

import { getSharedBullConnection, isBullRedisConfigured } from '@/server/queue/connection';
import { isBullDuplicateJobError, toBullJobId } from '@/server/queue/job-id';
import {
  QUEUE_NAMES,
  type CampaignSendJob,
  type ConversationRoutingJob,
  type WhatsappInboundJob,
  type WhatsappStatusJob,
} from '@/server/queue/names';
import { BadRequestError } from '@/server/api-handler';

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: getSharedBullConnection() });
  queues.set(name, queue);
  return queue;
}

async function addJob(
  queueName: string,
  name: string,
  data: object,
  jobId: string,
  extra?: { attempts?: number; backoff?: { type: 'exponential'; delay: number }; delay?: number },
): Promise<void> {
  try {
    await getQueue(queueName).add(name, data, {
      jobId: toBullJobId(jobId),
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
      ...extra,
    });
  } catch (error) {
    if (isBullDuplicateJobError(error)) return;
    throw error;
  }
}

export function assertQueueAvailable(): void {
  if (!isBullRedisConfigured()) {
    throw new BadRequestError(
      'Redis está desligado. Campanhas e fila de WhatsApp precisam de REDIS_URL e do container crm-redis.',
    );
  }
}

export async function enqueueCampaignSend(
  job: CampaignSendJob,
  options?: { delayMs?: number },
): Promise<void> {
  assertQueueAvailable();
  const delay = options?.delayMs;
  await addJob(QUEUE_NAMES.campaignSend, 'send', job, job.idempotencyKey, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    ...(delay != null && delay > 0 ? { delay } : {}),
  });
}

export async function enqueueCampaignRetry(job: CampaignSendJob): Promise<void> {
  assertQueueAvailable();
  await addJob(QUEUE_NAMES.campaignRetry, 'retry', job, `retry-${job.idempotencyKey}`, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  });
}

export async function enqueueWhatsappInbound(job: WhatsappInboundJob): Promise<void> {
  assertQueueAvailable();
  await addJob(QUEUE_NAMES.whatsappInbound, 'inbound', job, job.providerMessageId);
}

export async function enqueueWhatsappStatus(job: WhatsappStatusJob): Promise<void> {
  assertQueueAvailable();
  await addJob(
    QUEUE_NAMES.whatsappStatus,
    'status',
    job,
    `${job.providerMessageId}-${job.status}`,
  );
}

export async function enqueueConversationRouting(job: ConversationRoutingJob): Promise<void> {
  assertQueueAvailable();
  await addJob(
    QUEUE_NAMES.conversationRouting,
    'route',
    job,
    `route-${job.conversationId}-${Date.now()}`,
  );
}
