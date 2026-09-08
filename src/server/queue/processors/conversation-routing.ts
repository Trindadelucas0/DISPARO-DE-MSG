import type { CampaignRoutingMode } from '@prisma/client';

import { shouldAssignLeadOwner } from '@/constants/conversation';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { resolveAssignee } from '@/lib/routing';
import { prisma } from '@/lib/db';
import type { ConversationRoutingJob } from '@/server/queue/names';
import { connectLeadOwner } from '@/server/repositories/lead.repository';
import { recordAudit } from '@/server/services/audit.service';

async function loadRoundRobinUsers(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { active: true, role: 'USER' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function processConversationRoutingJob(
  job: ConversationRoutingJob,
): Promise<'assigned' | 'skipped'> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: job.conversationId },
    include: {
      lead: {
        select: {
          estado: true,
          cidade: true,
          segmento: true,
          porte: true,
          responsavelId: true,
        },
      },
      campaign: { select: { routingMode: true } },
      restrictions: { select: { userId: true } },
    },
  });

  if (!conversation) return 'skipped';
  if (conversation.assignedUserId) return 'skipped';

  const mode: CampaignRoutingMode = conversation.campaign?.routingMode ?? 'MANUAL';
  const rules = await prisma.routingRule.findMany({
    where: { active: true },
    orderBy: { priority: 'desc' },
  });

  const rrKey = conversation.campaignId ? `campaign:${conversation.campaignId}` : 'global';
  const rrState = await prisma.routingRoundRobinState.upsert({
    where: { key: rrKey },
    create: { key: rrKey, cursor: 0 },
    update: {},
  });

  const result = resolveAssignee({
    mode,
    lead: conversation.lead ?? {
      estado: null,
      cidade: null,
      segmento: null,
      porte: null,
      responsavelId: null,
    },
    rules,
    roundRobinUserIds: await loadRoundRobinUsers(),
    roundRobinCursor: rrState.cursor,
    restrictedUserIds: conversation.restrictions.map((row) => row.userId),
  });

  if (mode === 'ROUND_ROBIN') {
    await prisma.routingRoundRobinState.update({
      where: { key: rrKey },
      data: { cursor: result.nextCursor, lastUserId: result.userId },
    });
  }

  if (!result.userId) return 'skipped';

  const leadId = conversation.leadId;
  const syncLead = shouldAssignLeadOwner({
    leadId,
    currentResponsavelId: conversation.lead?.responsavelId,
    toUserId: result.userId,
  });
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        assignedUserId: result.userId,
        assignedAt: new Date(),
        status: 'OPEN',
      },
    }),
    prisma.conversationAssignment.create({
      data: {
        conversationId: conversation.id,
        fromUserId: null,
        toUserId: result.userId,
        reason: result.reason,
      },
    }),
    ...(syncLead && leadId ? [connectLeadOwner(leadId, result.userId)] : []),
  ]);

  await recordAudit({
    userId: null,
    action: 'conversation.route',
    entity: 'Conversation',
    entityId: conversation.id,
    changes: { toUserId: result.userId, reason: result.reason },
  });
  if (syncLead && leadId) {
    await recordAudit({
      userId: null,
      action: 'lead.reassign.from_conversation',
      entity: 'Lead',
      entityId: leadId,
      changes: {
        responsavelId: { from: conversation.lead?.responsavelId ?? null, to: result.userId },
      },
    });
  }

  await notifyChange({
    type: 'conversation.route',
    tags:
      syncLead && leadId
        ? [...MUTATION_TAGS.conversation, ...MUTATION_TAGS.lead(leadId)]
        : [...MUTATION_TAGS.conversation],
    entityId: conversation.id,
  });

  return 'assigned';
}
