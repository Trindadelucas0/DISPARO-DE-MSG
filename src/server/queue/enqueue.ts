import { Queue } from 'bullmq';

import { getSharedBullConnection, isBullRedisConfigured } from '@/server/queue/connection';
import { isBullDuplicateJobError, isCampaignJobId, toBullJobId } from '@/server/queue/job-id';
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

/**
 * `removeOnComplete`/`removeOnFail` guardam os últimos milhares de jobs, então o
 * jobId de quem já rodou continua no Redis. Sem apagar antes, o `add` seguinte é
 * engolido como duplicado e o destinatário fica QUEUED para sempre, sem job —
 * foi o que aconteceu com a fila que drenou com a campanha pausada.
 */
async function removeFinishedJob(queue: Queue, jobId: string): Promise<void> {
  const existing = await queue.getJob(jobId);
  if (!existing) return;
  const state = await existing.getState();
  if (state === 'completed' || state === 'failed') {
    await existing.remove().catch(() => undefined);
  }
}

async function addJob(
  queueName: string,
  name: string,
  data: object,
  jobId: string,
  extra?: { attempts?: number; backoff?: { type: 'exponential'; delay: number }; delay?: number },
): Promise<void> {
  const queue = getQueue(queueName);
  const id = toBullJobId(jobId);
  await removeFinishedJob(queue, id);
  try {
    await queue.add(name, data, {
      jobId: id,
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
      ...extra,
    });
  } catch (error) {
    if (isBullDuplicateJobError(error)) return;
    throw error;
  }
}

/** Estados que ainda vão rodar. `active` fica de fora: o job já está no worker. */
const PENDING_JOB_STATES = ['wait', 'delayed', 'paused'] as const;

/**
 * Tira da fila os jobs pendentes da campanha (primeira onda, retorno e retry).
 * Pausar ou cancelar sem isso deixa milhares de jobs que o worker vai puxar um a
 * um, gastando o ritmo de envio das outras campanhas para não mandar nada.
 */
export async function removeCampaignJobs(campaignId: string): Promise<number> {
  if (!isBullRedisConfigured()) return 0;
  let removed = 0;
  for (const queueName of [QUEUE_NAMES.campaignSend, QUEUE_NAMES.campaignRetry]) {
    const queue = getQueue(queueName);
    const jobs = await queue.getJobs([...PENDING_JOB_STATES], 0, -1);
    for (const job of jobs) {
      if (!job.id || !isCampaignJobId(job.id, campaignId)) continue;
      await job.remove().catch(() => undefined);
      removed += 1;
    }
  }
  return removed;
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
