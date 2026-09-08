import { timingSafeEqual } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { clientIp, checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { BadRequestError, handleApi, RateLimitError } from '@/server/api-handler';
import { assertQueueAvailable, enqueueWhatsappInbound, enqueueWhatsappStatus } from '@/server/queue/enqueue';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function secretsMatch(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Webhook Chatwoot. Não autentica sessão de usuário: valida segredo de env.
 * Persiste via fila — o CRM é a fonte da verdade.
 */
export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const ip = clientIp(request.headers) ?? 'unknown';
    const limit = await checkRateLimit('webhook-chatwoot', ip, RATE_LIMITS.webhook);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const expected = process.env.CHATWOOT_WEBHOOK_SECRET;
    const provided =
      request.headers.get('x-chatwoot-secret') ?? request.nextUrl.searchParams.get('secret');
    if (!secretsMatch(provided, expected)) {
      throw new BadRequestError('Webhook rejeitado: segredo inválido.');
    }

    assertQueueAvailable();
    const payload = (await request.json()) as Record<string, unknown>;
    const event = String(payload.event ?? payload.message_type ?? '');

    const account =
      (await prisma.whatsAppAccount.findFirst({
        where: { provider: 'CHATWOOT', status: 'ACTIVE' },
      })) ??
      (await prisma.whatsAppAccount.findFirst({ where: { provider: 'CHATWOOT' } }));

    if (!account) {
      throw new BadRequestError('Nenhuma conta Chatwoot cadastrada.');
    }

    if (event.includes('message_created') || event === 'message_created' || payload.content) {
      const content = String(payload.content ?? '');
      const messageType = String(payload.message_type ?? payload.messageType ?? '');
      const providerMessageId = String(
        payload.id ?? payload.message_id ?? `${Date.now()}-${Math.random()}`,
      );
      const sender = (payload.sender ?? payload.contact ?? {}) as Record<string, unknown>;
      const from = String(sender.phone_number ?? sender.phoneNumber ?? sender.identifier ?? '');

      if (messageType === 'incoming' || messageType === '0' || !messageType) {
        if (from && content) {
          await enqueueWhatsappInbound({
            accountId: account.id,
            from,
            body: content,
            providerMessageId,
            receivedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (event.includes('message_updated') || payload.status) {
      const providerMessageId = String(payload.id ?? payload.message_id ?? '');
      const statusRaw = String(payload.status ?? '').toUpperCase();
      const status =
        statusRaw === 'DELIVERED' || statusRaw === 'READ' || statusRaw === 'FAILED' || statusRaw === 'SENT'
          ? statusRaw
          : null;
      if (providerMessageId && status) {
        await enqueueWhatsappStatus({ providerMessageId, status });
      }
    }

    await prisma.whatsAppAccount.update({
      where: { id: account.id },
      data: { lastHeartbeatAt: new Date(), sessionStatus: 'CONNECTED', status: 'ACTIVE' },
    });

    return { ok: true };
  });
}
