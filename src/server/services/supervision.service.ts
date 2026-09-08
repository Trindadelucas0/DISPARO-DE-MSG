import { canSuperviseInbox, ForbiddenError, type SessionUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { supervisionSellersWhere } from '@/lib/supervision';
import { NotFoundError } from '@/server/api-handler';

export async function getAtendimentoOverview(user: SessionUser) {
  if (!canSuperviseInbox(user)) {
    throw new ForbiddenError('Somente gestor ou administrador acessa a supervisão.');
  }

  const [open, unassigned, inProgress, resolved] = await Promise.all([
    prisma.conversation.count({ where: { status: { in: ['OPEN', 'WAITING'] } } }),
    prisma.conversation.count({ where: { assignedUserId: null, status: { not: 'RESOLVED' } } }),
    prisma.conversation.count({ where: { status: 'OPEN' } }),
    prisma.conversation.count({ where: { status: 'RESOLVED' } }),
  ]);

  const sellers = await prisma.user.findMany({
    where: supervisionSellersWhere(),
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });

  const rows = await Promise.all(
    sellers.map(async (seller) => {
      const metrics = await getSellerAtendimentoMetrics(seller.id);
      return { ...seller, ...metrics };
    }),
  );

  return {
    kpis: { open, unassigned, inProgress, resolved },
    rows,
  };
}

export async function getSellerAtendimentoMetrics(userId: string) {
  const [open, responded, resolved, transferred, qualified, meetings, customers] =
    await Promise.all([
      prisma.conversation.count({
        where: { assignedUserId: userId, status: { in: ['OPEN', 'WAITING'] } },
      }),
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          status: { in: ['SENT', 'DELIVERED', 'READ'] },
          conversation: { assignedUserId: userId },
        },
      }),
      prisma.conversation.count({ where: { assignedUserId: userId, status: 'RESOLVED' } }),
      prisma.conversationAssignment.count({
        where: { fromUserId: userId, reason: 'TRANSFER' },
      }),
      prisma.lead.count({ where: { responsavelId: userId, status: 'QUALIFIED' } }),
      prisma.lead.count({ where: { responsavelId: userId, status: 'NEGOTIATION' } }),
      prisma.lead.count({ where: { responsavelId: userId, status: 'CUSTOMER' } }),
    ]);

  const withResponse = await prisma.conversation.findMany({
    where: {
      assignedUserId: userId,
      firstInboundAt: { not: null },
      firstResponseAt: { not: null },
    },
    select: { firstInboundAt: true, firstResponseAt: true },
    take: 500,
  });

  let avgFirstResponseMs: number | null = null;
  if (withResponse.length > 0) {
    const total = withResponse.reduce((sum, row) => {
      if (!row.firstInboundAt || !row.firstResponseAt) return sum;
      return sum + (row.firstResponseAt.getTime() - row.firstInboundAt.getTime());
    }, 0);
    avgFirstResponseMs = Math.round(total / withResponse.length);
  }

  return {
    open,
    responded,
    resolved,
    transferred,
    qualified,
    meetings,
    customers,
    avgFirstResponseMs,
  };
}

export async function getSellerAtendimentoDetail(user: SessionUser, userId: string) {
  if (!canSuperviseInbox(user)) {
    throw new ForbiddenError('Somente gestor ou administrador acessa a supervisão.');
  }
  const seller = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!seller) throw new NotFoundError('Vendedor não encontrado.');
  const metrics = await getSellerAtendimentoMetrics(userId);
  const conversations = await prisma.conversation.findMany({
    where: { assignedUserId: userId },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      unreadCount: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      phone: true,
      lead: { select: { id: true, razaoSocial: true, cnpj: true } },
    },
  });
  return {
    seller,
    metrics,
    conversations: conversations.map((row) => ({
      id: row.id,
      status: row.status,
      unreadCount: row.unreadCount,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: row.lastMessagePreview,
      leadId: row.lead?.id ?? null,
      razaoSocial: row.lead?.razaoSocial ?? row.phone,
      cnpj: row.lead?.cnpj ?? null,
    })),
  };
}
