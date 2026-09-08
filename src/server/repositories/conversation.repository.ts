import type { Prisma, MessageKind } from '@prisma/client';

import { prisma } from '@/lib/db';

export const CONVERSATION_LIST_SELECT = {
  id: true,
  leadId: true,
  whatsappAccountId: true,
  campaignId: true,
  phone: true,
  status: true,
  assignedUserId: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  unreadCount: true,
  firstInboundAt: true,
  firstResponseAt: true,
  assignedAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  lead: {
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      nomeFantasia: true,
      cidade: true,
      estado: true,
      status: true,
      responsavelId: true,
      nextContactAt: true,
      responsavel: { select: { id: true, name: true } },
    },
  },
  assignedUser: { select: { id: true, name: true } },
  whatsappAccount: { select: { id: true, name: true, phone: true } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.ConversationSelect;

export async function findConversationPage(params: {
  scope: Prisma.ConversationWhereInput;
  filter?: 'all' | 'unread' | 'mine' | 'unassigned' | 'open' | 'waiting' | 'resolved';
  search?: string;
  userId: string;
  page: number;
  limit: number;
}) {
  const and: Prisma.ConversationWhereInput[] = [params.scope];

  if (params.filter === 'unread') and.push({ unreadCount: { gt: 0 } });
  if (params.filter === 'mine') and.push({ assignedUserId: params.userId });
  if (params.filter === 'unassigned') and.push({ assignedUserId: null });
  if (params.filter === 'open') and.push({ status: 'OPEN' });
  if (params.filter === 'waiting') and.push({ status: 'WAITING' });
  if (params.filter === 'resolved') and.push({ status: 'RESOLVED' });

  if (params.search?.trim()) {
    const term = params.search.trim();
    and.push({
      OR: [
        { lead: { razaoSocial: { contains: term, mode: 'insensitive' } } },
        { lead: { nomeFantasia: { contains: term, mode: 'insensitive' } } },
        { phone: { contains: term } },
      ],
    });
  }

  const where = and.length === 1 ? and[0]! : { AND: and };

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: CONVERSATION_LIST_SELECT,
    }),
  ]);

  return { total, rows };
}

export async function findConversationById(id: string, scope: Prisma.ConversationWhereInput) {
  return prisma.conversation.findFirst({
    where: { id, ...scope },
    select: CONVERSATION_LIST_SELECT,
  });
}

export async function findOpenConversationForLeadAccount(
  leadId: string,
  whatsappAccountId: string,
) {
  return prisma.conversation.findFirst({
    where: {
      leadId,
      whatsappAccountId,
      status: { not: 'RESOLVED' },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 500,
    include: {
      media: {
        select: { id: true, kind: true, mimeType: true, fileName: true, sizeBytes: true },
      },
    },
  });
}

export async function createOutboundMessage(data: {
  conversationId: string;
  body: string;
  templateId?: string | null;
  campaignId?: string | null;
  mediaId?: string | null;
  kind?: MessageKind;
  providerMessageId?: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED';
}) {
  return prisma.message.create({
    data: {
      conversationId: data.conversationId,
      body: data.body,
      templateId: data.templateId ?? null,
      campaignId: data.campaignId ?? null,
      mediaId: data.mediaId ?? null,
      direction: 'OUTBOUND',
      kind: data.kind ?? (data.templateId ? 'TEMPLATE' : 'TEXT'),
      status: data.status,
      providerMessageId: data.providerMessageId ?? null,
      sentAt: data.status === 'SENT' ? new Date() : null,
    },
  });
}
