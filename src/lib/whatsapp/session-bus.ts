import { randomUUID } from 'node:crypto';

import { WHATSAPP_WORKER_MISSING, WHATSAPP_WORKER_SETUP } from '@/constants/whatsapp';
import { BadRequestError } from '@/server/api-handler';
import {
  getSharedBullConnection,
  isBullRedisConfigured,
} from '@/server/queue/connection';
import {
  contactsReplyKey,
  sendReplyKey,
  WHATSAPP_SESSION_CHANNEL,
  type WhatsAppContactsReply,
  type WhatsAppSendReply,
  type WhatsAppSessionCommand,
} from '@/lib/whatsapp/session-commands';

export function assertWhatsAppWorkerBus(): void {
  if (!isBullRedisConfigured()) {
    throw new BadRequestError(
      `REDIS_URL ausente. ${WHATSAPP_WORKER_SETUP}`,
    );
  }
}

export async function publishWhatsAppSessionCommand(command: WhatsAppSessionCommand): Promise<void> {
  assertWhatsAppWorkerBus();
  const redis = getSharedBullConnection();
  try {
    await redis.publish(WHATSAPP_SESSION_CHANNEL, JSON.stringify(command));
  } catch (error) {
    throw new BadRequestError(
      `Redis não publicou o comando da sessão: ${(error as Error).message}. ${WHATSAPP_WORKER_SETUP}`,
    );
  }
}

export async function requestWhatsAppSend(input: {
  accountId: string;
  to: string;
  body: string;
  mediaId?: string;
}): Promise<WhatsAppSendReply> {
  assertWhatsAppWorkerBus();
  const redis = getSharedBullConnection();
  const requestId = randomUUID();
  const key = sendReplyKey(requestId);
  await redis.del(key);
  await publishWhatsAppSessionCommand({
    action: 'send',
    accountId: input.accountId,
    to: input.to,
    body: input.body,
    requestId,
    mediaId: input.mediaId,
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const raw = await redis.get(key);
    if (raw) {
      await redis.del(key);
      return JSON.parse(raw) as WhatsAppSendReply;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, error: WHATSAPP_WORKER_MISSING };
}

export async function requestWhatsAppContacts(accountId: string): Promise<WhatsAppContactsReply> {
  assertWhatsAppWorkerBus();
  const redis = getSharedBullConnection();
  const requestId = randomUUID();
  const key = contactsReplyKey(requestId);
  await redis.del(key);
  await publishWhatsAppSessionCommand({
    action: 'list-contacts',
    accountId,
    requestId,
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const raw = await redis.get(key);
    if (raw) {
      await redis.del(key);
      return JSON.parse(raw) as WhatsAppContactsReply;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, error: WHATSAPP_WORKER_MISSING };
}
