import { timingSafeEqual } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { getEvolutionConfig } from '@/lib/evolution/config';
import {
  extractInboundMessage,
  extractInstanceNameFromPayload,
  extractPhoneFromPayload,
  mapEvolutionStateToSession,
  resolveQrImage,
} from '@/lib/evolution/qr';
import { clientIp, checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { BadRequestError, handleApi, RateLimitError } from '@/server/api-handler';
import { assertQueueAvailable, enqueueWhatsappInbound } from '@/server/queue/enqueue';
import { prisma } from '@/lib/db';
import {
  findWhatsAppAccountByInstanceName,
  updateWhatsAppAccount,
} from '@/server/repositories/whatsapp.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractBearer(header: string | null) {
  if (!header) return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? header.trim();
}

function extractEventType(payload: Record<string, unknown>, headerEvent?: string | null) {
  if (headerEvent) return headerEvent;
  if (typeof payload.event === 'string') return payload.event;
  if (typeof payload.type === 'string') return payload.type;
  return 'UNKNOWN';
}

/**
 * Webhook Evolution. Valida segredo; atualiza QR/sessão; enfileira inbound.
 * Nunca envia mensagem.
 */
export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const config = getEvolutionConfig();
    if (!config) {
      throw new BadRequestError('Webhook Evolution não configurado.');
    }

    const ip = clientIp(request.headers) ?? 'unknown';
    const limit = await checkRateLimit('webhook-evolution', ip, RATE_LIMITS.webhook);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const url = request.nextUrl;
    const candidates = [
      request.headers.get('x-webhook-secret'),
      request.headers.get('x-evolution-secret'),
      request.headers.get('apikey'),
      extractBearer(request.headers.get('authorization')),
      url.searchParams.get('token'),
      url.searchParams.get('apikey'),
    ];
    const authorized = candidates.some(
      (value) => secretsMatch(value, config.webhookSecret) || secretsMatch(value, config.apiKey),
    );
    if (!authorized) {
      throw new BadRequestError('Webhook rejeitado: segredo inválido.');
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const eventType = extractEventType(
      payload,
      request.headers.get('x-event') ?? request.headers.get('event'),
    ).toUpperCase();

    const instanceName =
      extractInstanceNameFromPayload(payload) ??
      (typeof payload.instance === 'string' ? payload.instance : null);

    let account = instanceName
      ? await findWhatsAppAccountByInstanceName(instanceName)
      : null;
    if (!account) {
      account = await prisma.whatsAppAccount.findFirst({
        where: { provider: 'EVOLUTION' },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!account) {
      return { ok: true, ignored: true, reason: 'no_account' };
    }

    if (eventType.includes('QRCODE')) {
      const qr = await resolveQrImage(payload);
      if (qr) {
        await updateWhatsAppAccount(account.id, {
          qrCode: qr,
          sessionStatus: 'QR_CODE',
          lastHeartbeatAt: new Date(),
        });
        await notifyChange({
          type: 'whatsapp.qr',
          tags: MUTATION_TAGS.whatsapp,
          entityId: account.id,
        });
      }
      return { ok: true, event: 'QRCODE_UPDATED' };
    }

    if (eventType.includes('CONNECTION')) {
      const stateRaw =
        typeof (payload.data as { state?: string } | undefined)?.state === 'string'
          ? (payload.data as { state: string }).state
          : typeof payload.state === 'string'
            ? payload.state
            : null;
      const sessionStatus = mapEvolutionStateToSession(stateRaw?.toLowerCase() ?? null);
      const phone = extractPhoneFromPayload(payload);
      await updateWhatsAppAccount(account.id, {
        sessionStatus,
        status: sessionStatus === 'CONNECTED' ? 'ACTIVE' : account.status,
        qrCode: sessionStatus === 'CONNECTED' ? null : undefined,
        phone: phone ?? undefined,
        lastHeartbeatAt: new Date(),
        lastConnectedAt: sessionStatus === 'CONNECTED' ? new Date() : undefined,
      });
      await notifyChange({
        type: 'whatsapp.status',
        tags: MUTATION_TAGS.whatsapp,
        entityId: account.id,
      });
      return { ok: true, event: 'CONNECTION_UPDATE', sessionStatus };
    }

    if (eventType.includes('MESSAGES_UPSERT') || eventType.includes('MESSAGE')) {
      const inbound = extractInboundMessage(payload);
      if (inbound) {
        assertQueueAvailable();
        await enqueueWhatsappInbound({
          accountId: account.id,
          from: inbound.from,
          body: inbound.body,
          providerMessageId: inbound.providerMessageId,
          receivedAt: new Date().toISOString(),
        });
      }
      return { ok: true, event: 'MESSAGES_UPSERT' };
    }

    return { ok: true, event: eventType };
  });
}
