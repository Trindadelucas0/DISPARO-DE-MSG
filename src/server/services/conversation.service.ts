import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Role, type LeadStatus } from '@prisma/client';
import { z } from 'zod';

import {
  inboxAttachLeadOwnerId,
  shouldAssignLeadOwner,
  shouldNotifyConversationRead,
  transferSliceStartIndex,
  type InboxFilter,
} from '@/constants/conversation';
import { messageKindFromMedia, messagePreviewFromMedia } from '@/constants/media';
import {
  canSuperviseInbox,
  canWriteConversation,
  canWriteLead,
  conversationScopeWhere,
  ForbiddenError,
  type SessionUser,
  assertStaff,
  canViewLeadContact,
} from '@/lib/auth/rbac';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { encodeWhatsappText, renderTemplate } from '@/lib/template';
import { createWhatsAppGateway } from '@/lib/whatsapp';
import { prisma } from '@/lib/db';
import { toWhatsappNumber } from '@/lib/validation/phone';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import { buildLeadTemplateVars } from '@/server/queue/campaign-helpers';
import {
  createOutboundMessage,
  deleteConversation,
  findConversationById,
  findConversationPage,
  findOpenConversationForLeadAccount,
  listMessages,
} from '@/server/repositories/conversation.repository';
import { connectLeadOwner } from '@/server/repositories/lead.repository';
import { findSendableConnectedAccount } from '@/server/repositories/whatsapp.repository';
import { createManualLead, getLead } from '@/server/services/lead.service';
import { recordAudit } from '@/server/services/audit.service';
import { recordInteraction } from '@/server/services/interaction.service';
import { changeLeadStatusFromConversation } from '@/server/services/kanban.service';
import { markLeadContactedOnOutbound } from '@/server/services/lead-funnel';
import { resolveOwnedOrAttachedMedia, serializeMedia } from '@/server/services/media.service';
import type { ManualLeadInput } from '@/features/leads/schema';
import type { LeadWhatsappSendResponse } from '@/features/messages/whatsapp-send';

export const conversationListSchema = z.object({
  filter: z
    .enum(['all', 'unread', 'mine', 'unassigned', 'open', 'waiting', 'resolved'])
    .default('all'),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(40),
});

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(4000).optional().default(''),
    templateId: z.string().min(1).optional(),
    mediaId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.body.trim() && !value.mediaId && !value.templateId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o texto ou anexe um arquivo.',
        path: ['body'],
      });
    }
  });

export const transferSchema = z.object({
  toUserId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

function assignmentNotifyTags(leadId: string | null, leadSynced: boolean) {
  if (leadSynced && leadId) {
    return [...MUTATION_TAGS.conversation, ...MUTATION_TAGS.lead(leadId)];
  }
  return [...MUTATION_TAGS.conversation];
}

async function auditLeadFollowsConversation(params: {
  actorUserId: string | null;
  leadId: string;
  fromUserId: string | null;
  toUserId: string;
}) {
  await recordAudit({
    userId: params.actorUserId,
    action: 'lead.reassign.from_conversation',
    entity: 'Lead',
    entityId: params.leadId,
    changes: { responsavelId: { from: params.fromUserId, to: params.toUserId } },
  });
}

function serializeConversation(
  row: NonNullable<Awaited<ReturnType<typeof findConversationById>>>,
  user: SessionUser,
) {
  return {
    id: row.id,
    leadId: row.leadId,
    whatsappAccountId: row.whatsappAccountId,
    campaignId: row.campaignId,
    phone: canViewLeadContact(user) ? row.phone : null,
    status: row.status,
    assignedUserId: row.assignedUserId,
    assignedUserNome: row.assignedUser?.name ?? null,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: row.lastMessagePreview,
    unreadCount: row.unreadCount,
    firstInboundAt: row.firstInboundAt?.toISOString() ?? null,
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    canWrite: canWriteConversation(user, row),
    canChangeLeadStatus: Boolean(row.leadId) && canWriteConversation(user, row),
    lead: row.lead
      ? {
          id: row.lead.id,
          cnpj: row.lead.cnpj,
          razaoSocial: row.lead.razaoSocial,
          nomeFantasia: row.lead.nomeFantasia,
          cidade: row.lead.cidade,
          estado: row.lead.estado,
          status: row.lead.status,
          whatsapp: row.lead.whatsapp,
          responsavelId: row.lead.responsavelId,
          responsavelNome: row.lead.responsavel?.name ?? null,
          nextContactAt: row.lead.nextContactAt?.toISOString() ?? null,
        }
      : null,
    whatsappAccount: row.whatsappAccount
      ? {
          id: row.whatsappAccount.id,
          name: row.whatsappAccount.name,
          phone: canViewLeadContact(user) ? row.whatsappAccount.phone : null,
        }
      : null,
    campaignName: row.campaign?.name ?? null,
  };
}

export type SerializedConversation = ReturnType<typeof serializeConversation>;

export async function listConversations(
  user: SessionUser,
  input: z.infer<typeof conversationListSchema>,
) {
  const scope = conversationScopeWhere(user);
  const { total, rows } = await findConversationPage({
    scope,
    filter: input.filter as InboxFilter,
    search: input.search,
    userId: user.id,
    page: input.page,
    limit: input.limit,
  });
  return {
    total,
    page: input.page,
    limit: input.limit,
    rows: rows.map((row) => serializeConversation(row, user)),
  };
}

export async function getConversation(user: SessionUser, id: string) {
  const scope = conversationScopeWhere(user);
  const row = await findConversationById(id, scope);
  if (!row) throw new NotFoundError('Conversa não encontrada ou fora do seu escopo.');
  return serializeConversation(row, user);
}

export async function getConversationMessages(user: SessionUser, id: string) {
  await getConversation(user, id);
  const rows = await listMessages(id);
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    kind: row.kind,
    body: row.body,
    status: row.status,
    media: row.media ? serializeMedia(row.media) : null,
    providerMessageId: row.providerMessageId,
    templateId: row.templateId,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function markConversationRead(user: SessionUser, id: string) {
  const conversation = await getConversation(user, id);
  if (!shouldNotifyConversationRead(conversation.unreadCount)) {
    return conversation;
  }
  await prisma.conversation.update({
    where: { id },
    data: { unreadCount: 0 },
  });
  await notifyChange({
    type: 'conversation.read',
    tags: MUTATION_TAGS.conversation,
    entityId: id,
  });
  return getConversation(user, id);
}

export async function sendConversationMessage(
  user: SessionUser,
  id: string,
  input: z.infer<typeof sendMessageSchema>,
) {
  const conversation = await getConversation(user, id);
  if (!canWriteConversation(user, conversation)) {
    throw new ForbiddenError('Você não pode responder esta conversa.');
  }
  if (conversation.status === 'RESOLVED') {
    throw new BadRequestError('Reabra a conversa antes de responder.');
  }

  let body = input.body;
  let mediaId = input.mediaId ?? null;
  if (input.templateId) {
    const template = await prisma.messageTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) throw new BadRequestError('Template não encontrado.');
    if (!conversation.leadId) {
      throw new BadRequestError('Template só vale em conversa ligada a um lead da base.');
    }
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: conversation.leadId } });
    body = renderTemplate(template.body, buildLeadTemplateVars(lead, { vendedor: user.name }));
    if (!mediaId && template.mediaId) mediaId = template.mediaId;
  }

  const media = mediaId ? await resolveOwnedOrAttachedMedia(user, mediaId) : null;
  if (!body.trim() && !media) {
    throw new BadRequestError('Informe o texto ou anexe um arquivo.');
  }
  const kind = messageKindFromMedia(media?.kind, Boolean(input.templateId));

  const account = await prisma.whatsAppAccount.findUniqueOrThrow({
    where: { id: conversation.whatsappAccountId },
  });
  const sendTo = await prisma.conversation.findUnique({
    where: { id },
    select: { phone: true },
  });
  if (!sendTo?.phone) {
    throw new BadRequestError('Conversa sem telefone.');
  }

  const pending = await createOutboundMessage({
    conversationId: id,
    body,
    templateId: input.templateId,
    campaignId: conversation.campaignId,
    mediaId: media?.id ?? null,
    kind,
    status: 'PENDING',
  });

  try {
    const gateway = createWhatsAppGateway(account);
    const result = await gateway.sendMessage({
      accountId: account.id,
      to: sendTo.phone,
      body,
      mediaId: media?.id,
      idempotencyKey: `reply:${id}:${pending.id}`,
      conversationId: id,
      leadId: conversation.leadId ?? undefined,
    });

    const now = new Date();
    await prisma.$transaction([
      prisma.message.update({
        where: { id: pending.id },
        data: { status: 'SENT', providerMessageId: result.providerMessageId, sentAt: now },
      }),
      prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: now,
          lastMessagePreview: messagePreviewFromMedia(body, kind),
          status: conversation.assignedUserId ? 'OPEN' : 'WAITING',
          firstResponseAt: conversation.firstResponseAt
            ? undefined
            : conversation.firstInboundAt
              ? now
              : undefined,
          unreadCount: 0,
        },
      }),
    ]);
  } catch (error) {
    await prisma.message.update({
      where: { id: pending.id },
      data: { status: 'FAILED' },
    });
    throw new BadRequestError((error as Error).message || 'Falha ao enviar mensagem.');
  }

  await recordAudit({
    userId: user.id,
    action: 'conversation.message',
    entity: 'Conversation',
    entityId: id,
  });
  await notifyChange({
    type: 'conversation.message',
    tags: MUTATION_TAGS.conversation,
    entityId: id,
  });
  if (conversation.leadId) {
    await markLeadContactedOnOutbound(conversation.leadId).catch((error: Error) => {
      console.error('[inbox] funil após envio:', error.message);
    });
  }
  return getConversationMessages(user, id);
}

export async function sendLeadWhatsapp(
  user: SessionUser,
  leadId: string,
  input: { templateId?: string | null; content: string },
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<LeadWhatsappSendResponse> {
  const lead = await getLead(user, leadId);
  if (!lead) throw new BadRequestError('Lead não encontrado ou fora do seu escopo.');
  if (!canWriteLead(user, { responsavelId: lead.responsavelId })) {
    throw new ForbiddenError('Este lead é de outro responsável. Peça a reatribuição ao gestor.');
  }

  const number = toWhatsappNumber(lead.whatsapp);
  if (!number) {
    throw new BadRequestError(
      'Este lead não tem celular válido. Use telefone ou e-mail, ou atualize o contato.',
    );
  }

  const account = await findSendableConnectedAccount();
  let templateMediaId: string | null = null;
  if (input.templateId) {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: input.templateId },
      select: { mediaId: true },
    });
    templateMediaId = template?.mediaId ?? null;
  }
  if (!account) {
    if (templateMediaId) {
      throw new BadRequestError(
        'Este template tem foto ou vídeo. Conecte o WhatsApp Web (QR) para enviar — wa.me não anexa arquivo.',
      );
    }
    const interaction = await recordInteraction(
      user,
      leadId,
      {
        type: 'WHATSAPP',
        result: 'OPENED',
        content: input.content,
        templateId: input.templateId ?? null,
      },
      context,
    );
    return {
      mode: 'manual',
      interaction,
      whatsappUrl: `https://wa.me/${number}?text=${encodeWhatsappText(input.content)}`,
    };
  }

  const conversationId = await sendLeadViaConnectedAccount({
    user,
    leadId,
    phone: number,
    body: input.content,
    templateId: input.templateId ?? null,
    mediaId: templateMediaId,
    account,
  });

  const interaction = await recordInteraction(
    user,
    leadId,
    {
      type: 'WHATSAPP',
      result: 'SENT',
      content: input.content,
      templateId: input.templateId ?? null,
    },
    context,
  );

  return { mode: 'connected', interaction, conversationId };
}

async function sendLeadViaConnectedAccount(params: {
  user: SessionUser;
  leadId: string;
  phone: string;
  body: string;
  templateId: string | null;
  mediaId: string | null;
  account: NonNullable<Awaited<ReturnType<typeof findSendableConnectedAccount>>>;
}): Promise<string> {
  const { user, leadId, phone, body, templateId, mediaId, account } = params;
  const media = mediaId ? await resolveOwnedOrAttachedMedia(user, mediaId) : null;
  const kind = messageKindFromMedia(media?.kind, Boolean(templateId));

  let conversation = await findOpenConversationForLeadAccount(leadId, account.id);

  if (!conversation) {
    const assignUser = user.role === Role.USER;
    conversation = await prisma.conversation.create({
      data: {
        leadId,
        whatsappAccountId: account.id,
        phone,
        status: assignUser ? 'OPEN' : 'WAITING',
        assignedUserId: assignUser ? user.id : null,
        assignedAt: assignUser ? new Date() : null,
        lastMessageAt: new Date(),
        lastMessagePreview: messagePreviewFromMedia(body, kind),
      },
    });
    if (assignUser) {
      await prisma.conversationAssignment.create({
        data: {
          conversationId: conversation.id,
          toUserId: user.id,
          reason: 'TAKE',
          createdById: user.id,
        },
      });
    }
  } else if (user.role === Role.USER && !conversation.assignedUserId) {
    const restricted = await prisma.conversationUserRestriction.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
    });
    if (restricted) {
      throw new BadRequestError('Este vendedor está bloqueado nesta conversa.');
    }
    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          assignedUserId: user.id,
          assignedAt: new Date(),
          status: 'OPEN',
          resolvedAt: null,
        },
      }),
      prisma.conversationAssignment.create({
        data: {
          conversationId: conversation.id,
          toUserId: user.id,
          reason: 'TAKE',
          createdById: user.id,
        },
      }),
    ]);
  } else if (user.role === Role.USER) {
    const restricted = await prisma.conversationUserRestriction.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
    });
    if (restricted) {
      throw new BadRequestError('Este vendedor está bloqueado nesta conversa.');
    }
  }

  const pending = await createOutboundMessage({
    conversationId: conversation.id,
    body,
    templateId,
    mediaId: media?.id ?? null,
    kind,
    status: 'PENDING',
  });

  try {
    const gateway = createWhatsAppGateway(account);
    const result = await gateway.sendMessage({
      accountId: account.id,
      to: conversation.phone || phone,
      body,
      mediaId: media?.id,
      idempotencyKey: `lead:${leadId}:${pending.id}`,
      conversationId: conversation.id,
      leadId,
    });

    const now = new Date();
    await prisma.$transaction([
      prisma.message.update({
        where: { id: pending.id },
        data: { status: 'SENT', providerMessageId: result.providerMessageId, sentAt: now },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          lastMessagePreview: messagePreviewFromMedia(body, kind),
          unreadCount: 0,
        },
      }),
    ]);
  } catch (error) {
    await prisma.message.update({
      where: { id: pending.id },
      data: { status: 'FAILED' },
    });
    throw new BadRequestError(
      (error as Error).message ||
        'Falha ao enviar pela conta conectada. Confira se o worker está ligado.',
    );
  }

  await recordAudit({
    userId: user.id,
    action: 'conversation.message',
    entity: 'Conversation',
    entityId: conversation.id,
    changes: { fromLead: leadId },
  });
  await notifyChange({
    type: 'conversation.message',
    tags: MUTATION_TAGS.conversation,
    entityId: conversation.id,
  });

  return conversation.id;
}

async function assertAssignable(conversationId: string, toUserId: string) {
  const restricted = await prisma.conversationUserRestriction.findUnique({
    where: { conversationId_userId: { conversationId, userId: toUserId } },
  });
  if (restricted) {
    throw new BadRequestError('Este vendedor está bloqueado nesta conversa.');
  }
  const user = await prisma.user.findFirst({ where: { id: toUserId, active: true } });
  if (!user) throw new BadRequestError('Usuário destino inválido ou inativo.');
}

export async function takeConversation(user: SessionUser, id: string) {
  const conversation = await getConversation(user, id);
  if (conversation.assignedUserId && conversation.assignedUserId !== user.id) {
    if (!canSuperviseInbox(user)) {
      throw new ForbiddenError('Esta conversa já tem responsável.');
    }
  }
  await assertAssignable(id, user.id);
  const from = conversation.assignedUserId;
  const leadId = conversation.leadId;
  const syncLead = shouldAssignLeadOwner({
    leadId,
    currentResponsavelId: conversation.lead?.responsavelId,
    toUserId: user.id,
  });
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id },
      data: {
        assignedUserId: user.id,
        assignedAt: new Date(),
        status: 'OPEN',
        resolvedAt: null,
      },
    }),
    prisma.conversationAssignment.create({
      data: {
        conversationId: id,
        fromUserId: from,
        toUserId: user.id,
        reason: 'TAKE',
        createdById: user.id,
      },
    }),
    ...(syncLead && leadId ? [connectLeadOwner(leadId, user.id)] : []),
  ]);
  if (syncLead && leadId) {
    await auditLeadFollowsConversation({
      actorUserId: user.id,
      leadId,
      fromUserId: conversation.lead?.responsavelId ?? null,
      toUserId: user.id,
    });
  }
  await recordAudit({
    userId: user.id,
    action: 'conversation.take',
    entity: 'Conversation',
    entityId: id,
  });
  await notifyChange({
    type: 'conversation.take',
    tags: assignmentNotifyTags(leadId, syncLead),
    entityId: id,
  });
  return getConversation(user, id);
}

export async function assignConversation(
  user: SessionUser,
  id: string,
  toUserId: string,
  note?: string,
) {
  if (!canSuperviseInbox(user)) {
    throw new ForbiddenError('Somente gestor ou administrador atribui conversas.');
  }
  const conversation = await getConversation(user, id);
  await assertAssignable(id, toUserId);
  const leadId = conversation.leadId;
  const syncLead = shouldAssignLeadOwner({
    leadId,
    currentResponsavelId: conversation.lead?.responsavelId,
    toUserId,
  });
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id },
      data: {
        assignedUserId: toUserId,
        assignedAt: new Date(),
        status: 'OPEN',
        resolvedAt: null,
      },
    }),
    prisma.conversationAssignment.create({
      data: {
        conversationId: id,
        fromUserId: conversation.assignedUserId,
        toUserId,
        reason: 'MANUAL',
        note: note ?? null,
        createdById: user.id,
      },
    }),
    ...(syncLead && leadId ? [connectLeadOwner(leadId, toUserId)] : []),
  ]);
  if (syncLead && leadId) {
    await auditLeadFollowsConversation({
      actorUserId: user.id,
      leadId,
      fromUserId: conversation.lead?.responsavelId ?? null,
      toUserId,
    });
  }
  await recordAudit({
    userId: user.id,
    action: 'conversation.assign',
    entity: 'Conversation',
    entityId: id,
    changes: { toUserId },
  });
  await notifyChange({
    type: 'conversation.assign',
    tags: assignmentNotifyTags(leadId, syncLead),
    entityId: id,
  });
  return getConversation(user, id);
}

export async function transferConversation(
  user: SessionUser,
  id: string,
  input: z.infer<typeof transferSchema>,
) {
  if (!canSuperviseInbox(user)) {
    throw new ForbiddenError('Somente gestor ou administrador transfere conversas.');
  }
  const conversation = await getConversation(user, id);
  await assertAssignable(id, input.toUserId);
  const leadId = conversation.leadId;
  const syncLead = shouldAssignLeadOwner({
    leadId,
    currentResponsavelId: conversation.lead?.responsavelId,
    toUserId: input.toUserId,
  });
  const [msgByDirection, sellerBefore, sameLeadOthers, threadMessages, rawConversation] =
    await Promise.all([
      prisma.message.groupBy({
        by: ['direction'],
        where: { conversationId: id },
        _count: { _all: true },
      }),
      prisma.conversation.findMany({
        where: { assignedUserId: input.toUserId },
        select: { id: true },
      }),
      leadId
        ? prisma.conversation.findMany({
            where: { leadId, id: { not: id } },
            select: { id: true, assignedUserId: true, status: true },
          })
        : Promise.resolve([]),
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          campaignId: true,
          direction: true,
          kind: true,
          body: true,
          createdAt: true,
        },
      }),
      prisma.conversation.findUniqueOrThrow({
        where: { id },
        select: { phone: true, whatsappAccountId: true, unreadCount: true },
      }),
    ]);
  const splitStart = transferSliceStartIndex(threadMessages);
  const leftoverMessages = splitStart > 0 ? threadMessages.slice(0, splitStart) : [];
  const sliceMessages = splitStart > 0 ? threadMessages.slice(splitStart) : threadMessages;
  const latestCampaignId =
    [...sliceMessages].reverse().find((row) => row.campaignId)?.campaignId ??
    conversation.campaignId;
  // #region agent log
  {
    const payload = {
      sessionId: 'da6cd6',
      runId: 'post-fix',
      hypothesisId: 'E',
      location: 'conversation.service.ts:transfer:before',
      message: 'transfer before assign',
      data: {
        conversationId: id,
        toUserId: input.toUserId,
        hasLead: Boolean(leadId),
        phoneLen: conversation.phone?.length ?? 0,
        inboundCount: msgByDirection.find((row) => row.direction === 'INBOUND')?._count._all ?? 0,
        outboundCount: msgByDirection.find((row) => row.direction === 'OUTBOUND')?._count._all ?? 0,
        messageCount: msgByDirection.reduce((sum, row) => sum + row._count._all, 0),
        sellerConvCountBefore: sellerBefore.length,
        sameLeadOtherCount: sameLeadOthers.length,
        sameLeadOtherAssigned: sameLeadOthers.filter((row) => row.assignedUserId).length,
        splitStart,
        leftoverCount: leftoverMessages.length,
        sliceCount: sliceMessages.length,
      },
      timestamp: Date.now(),
    };
    fetch('http://127.0.0.1:7573/ingest/168a1e45-0a27-4a12-9ec9-dabfa1ec792b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da6cd6' },
      body: JSON.stringify(payload),
    }).catch(() => {});
    void appendFile(join(process.cwd(), '..', 'debug-da6cd6.log'), `${JSON.stringify(payload)}\n`).catch(
      () => {},
    );
  }
  // #endregion
  const now = new Date();
  if (leftoverMessages.length > 0) {
    const leftoverLast = leftoverMessages[leftoverMessages.length - 1]!;
    const sliceLast = sliceMessages[sliceMessages.length - 1]!;
    const leftoverPreview = messagePreviewFromMedia(leftoverLast.body, leftoverLast.kind);
    const slicePreview = messagePreviewFromMedia(sliceLast.body, sliceLast.kind);
    const sliceFirstInbound = sliceMessages.find((row) => row.direction === 'INBOUND')?.createdAt ?? null;
    await prisma.$transaction(async (tx) => {
      const leftover = await tx.conversation.create({
        data: {
          leadId,
          whatsappAccountId: rawConversation.whatsappAccountId,
          campaignId: leftoverLast.campaignId,
          phone: rawConversation.phone,
          status: 'RESOLVED',
          resolvedAt: now,
          lastMessageAt: leftoverLast.createdAt,
          lastMessagePreview: leftoverPreview,
          unreadCount: 0,
        },
      });
      await tx.message.updateMany({
        where: { id: { in: leftoverMessages.map((row) => row.id) } },
        data: { conversationId: leftover.id },
      });
      await tx.conversation.update({
        where: { id },
        data: {
          assignedUserId: input.toUserId,
          assignedAt: now,
          status: 'OPEN',
          campaignId: latestCampaignId,
          lastMessageAt: sliceLast.createdAt,
          lastMessagePreview: slicePreview,
          firstInboundAt: sliceFirstInbound,
          unreadCount: rawConversation.unreadCount,
        },
      });
      await tx.conversationAssignment.create({
        data: {
          conversationId: id,
          fromUserId: conversation.assignedUserId,
          toUserId: input.toUserId,
          reason: 'TRANSFER',
          note: input.note ?? null,
          createdById: user.id,
        },
      });
      if (syncLead && leadId) {
        await tx.lead.update({
          where: { id: leadId },
          data: { responsavel: { connect: { id: input.toUserId } } },
        });
      }
    });
  } else {
    await prisma.$transaction([
      prisma.conversation.update({
        where: { id },
        data: {
          assignedUserId: input.toUserId,
          assignedAt: now,
          status: 'OPEN',
        },
      }),
      prisma.conversationAssignment.create({
        data: {
          conversationId: id,
          fromUserId: conversation.assignedUserId,
          toUserId: input.toUserId,
          reason: 'TRANSFER',
          note: input.note ?? null,
          createdById: user.id,
        },
      }),
      ...(syncLead && leadId ? [connectLeadOwner(leadId, input.toUserId)] : []),
    ]);
  }
  if (syncLead && leadId) {
    await auditLeadFollowsConversation({
      actorUserId: user.id,
      leadId,
      fromUserId: conversation.lead?.responsavelId ?? null,
      toUserId: input.toUserId,
    });
  }
  await recordAudit({
    userId: user.id,
    action: 'conversation.transfer',
    entity: 'Conversation',
    entityId: id,
    changes: { toUserId: input.toUserId },
  });
  await notifyChange({
    type: 'conversation.transfer',
    tags: assignmentNotifyTags(leadId, syncLead),
    entityId: id,
  });
  // #region agent log
  const sellerAfter = await prisma.conversation.findMany({
    where: { assignedUserId: input.toUserId },
    select: { id: true },
  });
  const beforeIds = new Set(sellerBefore.map((row) => row.id));
  const newlyAssignedIds = sellerAfter.map((row) => row.id).filter((rowId) => !beforeIds.has(rowId));
  const afterPayload = {
    sessionId: 'da6cd6',
    runId: 'post-fix',
    hypothesisId: 'B',
    location: 'conversation.service.ts:transfer:after',
    message: 'transfer after assign',
    data: {
      conversationId: id,
      toUserId: input.toUserId,
      sellerConvCountAfter: sellerAfter.length,
      newlyAssignedCount: newlyAssignedIds.length,
      newlyAssignedIncludesTarget: newlyAssignedIds.includes(id),
      extraAssignedCount: newlyAssignedIds.filter((rowId) => rowId !== id).length,
      splitApplied: leftoverMessages.length > 0,
      leftoverCount: leftoverMessages.length,
      sliceCount: sliceMessages.length,
    },
    timestamp: Date.now(),
  };
  fetch('http://127.0.0.1:7573/ingest/168a1e45-0a27-4a12-9ec9-dabfa1ec792b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da6cd6' },
    body: JSON.stringify(afterPayload),
  }).catch(() => {});
  void appendFile(join(process.cwd(), '..', 'debug-da6cd6.log'), `${JSON.stringify(afterPayload)}\n`).catch(
    () => {},
  );
  // #endregion
  return getConversation(user, id);
}

export async function resolveConversation(user: SessionUser, id: string) {
  const conversation = await getConversation(user, id);
  if (!canWriteConversation(user, conversation)) {
    throw new ForbiddenError('Você não pode resolver esta conversa.');
  }
  await prisma.conversation.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
  await recordAudit({
    userId: user.id,
    action: 'conversation.resolve',
    entity: 'Conversation',
    entityId: id,
  });
  await notifyChange({
    type: 'conversation.resolve',
    tags: MUTATION_TAGS.conversation,
    entityId: id,
  });
  return getConversation(user, id);
}

export async function reopenConversation(user: SessionUser, id: string) {
  const conversation = await getConversation(user, id);
  if (!canWriteConversation(user, conversation)) {
    throw new ForbiddenError('Você não pode reabrir esta conversa.');
  }
  await prisma.conversation.update({
    where: { id },
    data: {
      status: conversation.assignedUserId ? 'OPEN' : 'WAITING',
      resolvedAt: null,
    },
  });
  await recordAudit({
    userId: user.id,
    action: 'conversation.reopen',
    entity: 'Conversation',
    entityId: id,
  });
  await notifyChange({
    type: 'conversation.reopen',
    tags: MUTATION_TAGS.conversation,
    entityId: id,
  });
  return getConversation(user, id);
}

/** Apaga só no CRM. O lead e o WhatsApp do contato permanecem. */
export async function removeConversation(user: SessionUser, id: string) {
  const conversation = await getConversation(user, id);
  if (!canWriteConversation(user, conversation)) {
    throw new ForbiddenError('Você não pode excluir esta conversa.');
  }
  await deleteConversation(id);
  await recordAudit({
    userId: user.id,
    action: 'conversation.delete',
    entity: 'Conversation',
    entityId: id,
    changes: { leadId: conversation.leadId, assignedUserId: conversation.assignedUserId },
  });
  await notifyChange({
    type: 'conversation.delete',
    tags: MUTATION_TAGS.conversation,
    entityId: id,
  });
  return { ok: true };
}

export async function changeConversationLeadStatus(
  user: SessionUser,
  id: string,
  status: LeadStatus,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const conversation = await getConversation(user, id);
  if (!canWriteConversation(user, conversation)) {
    throw new ForbiddenError('Assuma a conversa para alterar o funil.');
  }
  if (!conversation.leadId || !conversation.lead) {
    throw new BadRequestError('Esta conversa não está ligada a um lead.');
  }
  await changeLeadStatusFromConversation(
    user,
    conversation.leadId,
    conversation.lead.status,
    status,
    context,
  );
  await notifyChange({
    type: 'conversation.lead_status',
    tags: MUTATION_TAGS.conversation,
    entityId: id,
  });
  return getConversation(user, id);
}

export async function attachConversationContact(
  user: SessionUser,
  id: string,
  input: ManualLeadInput,
) {
  assertStaff(user);
  const conversation = await getConversation(user, id);
  if (!canWriteConversation(user, conversation)) {
    throw new ForbiddenError('Você não pode alterar esta conversa.');
  }
  if (conversation.leadId) {
    return getConversation(user, id);
  }

  const lead = await createManualLead(
    user,
    {
      name: input.name,
      whatsapp: input.whatsapp?.trim() || conversation.phone || undefined,
      cnpj: input.cnpj,
    },
    {
      origem: 'WHATSAPP_INBOX',
      status: 'CONTACTED',
      responsavelId: inboxAttachLeadOwnerId(conversation.assignedUserId, user.id),
    },
  );

  await prisma.conversation.update({
    where: { id },
    data: { leadId: lead.id },
  });
  await recordAudit({
    userId: user.id,
    action: 'conversation.attach_contact',
    entity: 'Conversation',
    entityId: id,
  });
  await notifyChange({
    type: 'conversation.attach_contact',
    tags: [...MUTATION_TAGS.conversation, ...MUTATION_TAGS.lead(lead.id)],
    entityId: id,
  });
  return getConversation(user, id);
}
