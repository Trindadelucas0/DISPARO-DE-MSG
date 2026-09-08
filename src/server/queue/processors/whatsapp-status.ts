import { prisma } from '@/lib/db';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import type { WhatsappStatusJob } from '@/server/queue/names';

export async function processWhatsappStatusJob(job: WhatsappStatusJob): Promise<'ok' | 'ignored'> {
  const message = await prisma.message.findUnique({
    where: { providerMessageId: job.providerMessageId },
  });
  if (!message) return 'ignored';

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: job.status,
      ...(job.status === 'FAILED' ? {} : {}),
    },
  });

  if (message.campaignId && (job.status === 'DELIVERED' || job.status === 'FAILED')) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: message.conversationId },
      select: { leadId: true },
    });
    if (conversation?.leadId) {
      await prisma.campaignRecipient.updateMany({
        where: {
          campaignId: message.campaignId,
          leadId: conversation.leadId,
          status: { in: ['SENT', 'QUEUED'] },
        },
        data: {
          status: job.status === 'DELIVERED' ? 'DELIVERED' : 'FAILED',
          error: job.status === 'FAILED' ? (job.error ?? 'Falha no provedor').slice(0, 500) : null,
          processedAt: new Date(),
        },
      });
    }
  }

  await notifyChange({
    type: 'whatsapp.status',
    tags: [...MUTATION_TAGS.conversation, ...MUTATION_TAGS.campaign],
    entityId: message.conversationId,
  });

  return 'ok';
}
