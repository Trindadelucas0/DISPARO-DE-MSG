import { onlyDigits } from '@/lib/validation/cnpj';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { prisma } from '@/lib/db';
import { messageKindFromMedia, messagePreviewFromMedia } from '@/constants/media';
import { inboundCaptionForStorage } from '@/lib/whatsapp/inbound-guard';
import type { WhatsappInboundJob } from '@/server/queue/names';
import { enqueueConversationRouting } from '@/server/queue/enqueue';

function normalizePhone(raw: string): string {
  const digits = onlyDigits(raw);
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
  return digits;
}

/**
 * Inbound. Número conhecido liga a conversa ao lead.
 * Número desconhecido: conversa sem lead (Admin vê o texto). Não inventa empresa/CNPJ.
 */
export async function processWhatsappInboundJob(job: WhatsappInboundJob): Promise<'ok' | 'ignored'> {
  const existing = await prisma.message.findUnique({
    where: { providerMessageId: job.providerMessageId },
  });
  if (existing) return 'ignored';

  const phone = normalizePhone(job.from);
  if (phone.length < 10) return 'ignored';

  const account = await prisma.whatsAppAccount.findUnique({ where: { id: job.accountId } });
  if (!account) return 'ignored';

  const lead = await prisma.lead.findFirst({
    where: {
      OR: [
        { whatsapp: { contains: phone.slice(-11) } },
        { whatsapp: { contains: phone.slice(-10) } },
        { telefone: { contains: phone.slice(-11) } },
        { telefone: { contains: phone.slice(-10) } },
      ],
    },
  });

  let conversation = lead
    ? await prisma.conversation.findFirst({
        where: {
          leadId: lead.id,
          whatsappAccountId: account.id,
          status: { not: 'RESOLVED' },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : await prisma.conversation.findFirst({
        where: {
          leadId: null,
          whatsappAccountId: account.id,
          status: { not: 'RESOLVED' },
          OR: [{ phone: { contains: phone.slice(-11) } }, { phone: { contains: phone.slice(-10) } }],
        },
        orderBy: { updatedAt: 'desc' },
      });

  const receivedAt = new Date(job.receivedAt);
  const storedPhone = lead?.whatsapp ?? phone;
  const kind = messageKindFromMedia(
    job.kind === 'IMAGE' || job.kind === 'VIDEO' || job.kind === 'AUDIO' ? job.kind : null,
    false,
  );
  const body = inboundCaptionForStorage(job.body, Boolean(job.mediaId));
  const preview = messagePreviewFromMedia(body, kind);

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
