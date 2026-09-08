import type { Prisma } from '@prisma/client';

import type { LeadFilters } from '@/features/leads/schema';
import { endOfDay, startOfDay } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { withLastResultFilter } from '@/server/repositories/interaction.repository';
import { buildLeadWhere } from '@/server/repositories/lead.repository';

/**
 * Agregações do dashboard. COUNT / groupBy no recorte — nunca findMany da base.
 */

export async function loadDashboardMetrics(
  filters: LeadFilters,
  scope: Prisma.LeadWhereInput,
) {
  const where = await withLastResultFilter(buildLeadWhere(filters, scope), filters.lastResult);
  const today = startOfDay();
  const todayEnd = endOfDay();

  const [
    total,
    byStatus,
    withWhatsapp,
    contactToday,
    contacted,
    responded,
    qualified,
    customers,
    overdueFollowUps,
    interactionsToday,
    responsesToday,
    upcomingFollowUps,
  ] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    prisma.lead.count({ where: { AND: [where, { NOT: { whatsapp: null } }] } }),
    prisma.lead.count({
      where: { AND: [where, { nextContactAt: { gte: today, lte: todayEnd } }] },
    }),
    prisma.lead.count({ where: { AND: [where, { status: 'CONTACTED' }] } }),
    countLeadsWithLastResult(where, 'RESPONDED'),
    prisma.lead.count({ where: { AND: [where, { status: 'QUALIFIED' }] } }),
    prisma.lead.count({ where: { AND: [where, { status: 'CUSTOMER' }] } }),
    prisma.followUp.count({
      where: {
        status: 'PENDING',
        scheduledFor: { lt: today },
        lead: where,
      },
    }),
    prisma.interaction.count({
      where: { occurredAt: { gte: today }, lead: where },
    }),
    prisma.interaction.count({
      where: { occurredAt: { gte: today }, result: 'RESPONDED', lead: where },
    }),
    prisma.followUp.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        scheduledFor: { gte: today },
        lead: where,
      },
      select: {
        id: true,
        leadId: true,
        scheduledFor: true,
        note: true,
        lead: { select: { razaoSocial: true, cidade: true, estado: true } },
        responsavel: { select: { name: true } },
      },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: 8,
    }),
  ]);

  return {
    total,
    byStatus,
    withWhatsapp,
    contactToday,
    contacted,
    responded,
    qualified,
    customers,
    overdueFollowUps,
    interactionsToday,
    responsesToday,
    upcomingFollowUps,
  };
}

async function countLeadsWithLastResult(
  where: Prisma.LeadWhereInput,
  result: 'RESPONDED',
): Promise<number> {
  const filtered = await withLastResultFilter(where, result);
  return prisma.lead.count({ where: filtered });
}

export async function loadReportMetrics(
  filters: LeadFilters,
  scope: Prisma.LeadWhereInput,
  from: Date,
  to: Date,
) {
  const where = await withLastResultFilter(buildLeadWhere(filters, scope), filters.lastResult);
  const interactionWhere: Prisma.InteractionWhereInput = {
    occurredAt: { gte: from, lte: to },
    lead: where,
  };

  const [byUser, byType, byResult, totalInteractions, sent, responded] = await Promise.all([
    prisma.interaction.groupBy({
      by: ['userId'],
      where: interactionWhere,
      _count: { _all: true },
      orderBy: { userId: 'asc' },
    }),
    prisma.interaction.groupBy({
      by: ['type'],
      where: interactionWhere,
      _count: { _all: true },
      orderBy: { type: 'asc' },
    }),
    prisma.interaction.groupBy({
      by: ['result'],
      where: interactionWhere,
      _count: { _all: true },
      orderBy: { result: 'asc' },
    }),
    prisma.interaction.count({ where: interactionWhere }),
    prisma.interaction.count({ where: { ...interactionWhere, result: 'SENT' } }),
    prisma.interaction.count({ where: { ...interactionWhere, result: 'RESPONDED' } }),
  ]);

  return { byUser, byType, byResult, totalInteractions, sent, responded };
}

export async function findUsersByIds(ids: readonly string[]) {
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, email: true },
  });
}
