import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { prisma } from '@/lib/db';
import { messageKindFromMedia, messagePreviewFromMedia } from '@/constants/media';
import { inboundCaptionForStorage, inboundStoredPhone } from '@/lib/whatsapp/inbound-guard';
import { leadMatchesImportedPhone, phoneMatchVariants } from '@/lib/whatsapp/contacts';
import { parsePhone } from '@/lib/validation/phone';
import type { WhatsappInboundJob } from '@/server/queue/names';
import { enqueueConversationRouting } from '@/server/queue/enqueue';

/**
 * Inbound. Número conhecido liga a conversa ao lead.
 * Número desconhecido: conversa sem lead (Admin vê o texto). Não inventa empresa/CNPJ.
 */
export async function processWhatsappInboundJob(job: WhatsappInboundJob): Promise<'ok' | 'ignored'> {
  const existing = await prisma.message.findUnique({
    where: { providerMessageId: job.providerMessageId },
  });
  if (existing) return 'ignored';

  const phone = inboundStoredPhone(job.from);
  if (!phone) return 'ignored';

  const account = await prisma.whatsAppAccount.findUnique({ where: { id: job.accountId } });
  if (!account) return 'ignored';

  const variants = phoneMatchVariants(phone);
  const leadCandidates = await prisma.lead.findMany({
    where: {
      OR: variants.flatMap((value) => [
        { whatsapp: { contains: value } },
        { telefone: { contains: value } },
      ]),
    },
    take: 25,
    select: { id: true, whatsapp: true, telefone: true, phones: true },
  });
  const matchedLeads = leadCandidates.filter((row) => leadMatchesImportedPhone(row, phone));
  const leadMatchCount = matchedLeads.length;
  const lead =
    matchedLeads.find((row) => parsePhone(row.whatsapp)?.digits === phone) ??
    matchedLeads[0] ??
    null;

  let conversation = lead
    ? await prisma.conversation.findFirst({
        where: {
          leadId: lead.id,
          whatsappAccountId: account.id,
          status: { not: 'RESOLVED' },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : null;
  if (!lead) {
    const openUnknown = await prisma.conversation.findMany({
      where: {
        leadId: null,
        whatsappAccountId: account.id,
        status: { not: 'RESOLVED' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });
    conversation =
      openUnknown.find((row) =>
        leadMatchesImportedPhone(
          { id: row.id, whatsapp: row.phone, telefone: null, phones: [] },
          phone,
        ),
      ) ?? null;
  }

  const receivedAt = new Date(job.receivedAt);
  const storedPhone = phone;
  const kind = messageKindFromMedia(
    job.kind === 'IMAGE' || job.kind === 'VIDEO' || job.kind === 'AUDIO' ? job.kind : null,
    false,
  );
  const body = inboundCaptionForStorage(job.body, Boolean(job.mediaId));
  const preview = messagePreviewFromMedia(body, kind);

  // #region agent log
  {
    const existingMsgCount = conversation
      ? await prisma.message.count({ where: { conversationId: conversation.id } })
      : 0;
    const storedDigits = conversation ? conversation.phone.replace(/\D/g, '') : '';
    fetch('http://127.0.0.1:7573/ingest/168a1e45-0a27-4a12-9ec9-dabfa1ec792b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da6cd6' },
      body: JSON.stringify({
        sessionId: 'da6cd6',
        runId: 'post-fix',
        hypothesisId: 'A',
        location: 'whatsapp-inbound.ts:match',
        message: 'inbound conversation match',
        data: {
          fromLen: phone.length,
          leadMatched: Boolean(lead),
          leadMatchCount,
          reusedConversation: Boolean(conversation),
          conversationId: conversation?.id ?? null,
          existingMsgCount,
          assignedUserId: conversation?.assignedUserId ?? null,
          phoneKeyMismatch: Boolean(
            conversation && storedDigits.slice(-10) !== phone.slice(-10),
          ),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        leadId: lead?.id ?? null,
        whatsappAccountId: account.id,
        phone: storedPhone,
        status: 'WAITING',
        lastMessageAt: receivedAt,
        lastMessagePreview: preview,
        unreadCount: 1,
        firstInboundAt: receivedAt,
      },
    });
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: receivedAt,
        lastMessagePreview: preview,
        unreadCount: { increment: 1 },
        firstInboundAt: conversation.firstInboundAt ?? receivedAt,
        status: conversation.status === 'RESOLVED' ? 'WAITING' : conversation.status,
      },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      kind,
      body,
      mediaId: job.mediaId ?? null,
      status: 'DELIVERED',
      providerMessageId: job.providerMessageId,
      sentAt: receivedAt,
      campaignId: conversation.campaignId,
    },
  });

  if (conversation.campaignId && lead) {
    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId: conversation.campaignId,
        leadId: lead.id,
        status: { in: ['SENT', 'DELIVERED', 'QUEUED'] },
      },
      data: { status: 'RESPONDED', processedAt: new Date() },
    });
  }

  if (!conversation.assignedUserId && lead) {
    await enqueueConversationRouting({
      conversationId: conversation.id,
      campaignId: conversation.campaignId,
    }).catch(() => undefined);
  }

  await notifyChange({
    type: 'whatsapp.inbound',
    tags: [...MUTATION_TAGS.conversation, ...MUTATION_TAGS.campaign],
    entityId: conversation.id,
  });

  return 'ok';
}
