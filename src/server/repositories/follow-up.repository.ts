import type { FollowUpStatus, Prisma } from '@prisma/client';

import type { ContactBucket } from '@/lib/priority';
import { startOfDay, endOfDay } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  attachLastInteraction,
  type LastInteractionFields,
} from '@/server/repositories/interaction.repository';

export const FOLLOW_UP_SELECT = {
  id: true,
  leadId: true,
  responsavelId: true,
  criadoPorId: true,
  scheduledFor: true,
  note: true,
  status: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  lead: {
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      whatsapp: true,
      telefone: true,
      email: true,
      cidade: true,
      estado: true,
      status: true,
      lastContactAt: true,
      nextContactAt: true,
      createdAt: true,
    },
  },
  responsavel: { select: { id: true, name: true } },
} satisfies Prisma.FollowUpSelect;

type FollowUpRowBase = Prisma.FollowUpGetPayload<{ select: typeof FOLLOW_UP_SELECT }>;
export type FollowUpRow = Omit<FollowUpRowBase, 'lead'> & {
  lead: FollowUpRowBase['lead'] & LastInteractionFields;
};

async function withLeadLastInteraction(rows: FollowUpRowBase[]): Promise<FollowUpRow[]> {
  const leads = await attachLastInteraction(rows.map((row) => row.lead));
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  return rows.map((row) => ({
    ...row,
    lead: byId.get(row.lead.id) ?? {
      ...row.lead,
      lastInteractionResult: null,
      lastInteractionAt: null,
    },
  }));
}

export async function listFollowUps(
  scope: Prisma.LeadWhereInput,
  filters: {
    tab: 'overdue' | 'today' | 'upcoming' | 'all';
    status?: FollowUpStatus | 'OPEN';
    responsible?: string;
    leadStatus?: Prisma.LeadWhereInput['status'];
    state?: string;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  },
): Promise<{ rows: FollowUpRow[]; total: number; counts: FollowUpTabCounts }> {
  const today = startOfDay();
  const todayEnd = endOfDay();
  const leadWhere: Prisma.LeadWhereInput = { AND: [scope] };
  if (filters.leadStatus) leadWhere.AND = [...(leadWhere.AND as Prisma.LeadWhereInput[]), { status: filters.leadStatus }];
  if (filters.state) {
    leadWhere.AND = [...(leadWhere.AND as Prisma.LeadWhereInput[]), { estado: filters.state }];
  }

  const base: Prisma.FollowUpWhereInput[] = [{ lead: leadWhere }];

  if (filters.responsible === 'none') {
    base.push({ lead: { responsavelId: null } });
  } else if (filters.responsible) {
    base.push({ responsavelId: filters.responsible });
  }

  if (filters.status === 'OPEN') {
    base.push({ status: { in: ['PENDING', 'OVERDUE'] } });
  } else if (filters.status) {
    base.push({ status: filters.status });
  }

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from) range.gte = filters.from;
    if (filters.to) range.lte = filters.to;
    base.push({ scheduledFor: range });
  }

  const openBase: Prisma.FollowUpWhereInput[] = [
    ...base.filter((clause) => !('status' in clause)),
    { status: { in: ['PENDING', 'OVERDUE'] } },
  ];

  const overdueWhere: Prisma.FollowUpWhereInput = {
    AND: [...openBase, { scheduledFor: { lt: today } }],
  };
  const todayWhere: Prisma.FollowUpWhereInput = {
    AND: [...openBase, { scheduledFor: { gte: today, lte: todayEnd } }],
  };
  const upcomingWhere: Prisma.FollowUpWhereInput = {
    AND: [...openBase, { scheduledFor: { gt: todayEnd } }],
  };
  const allWhere: Prisma.FollowUpWhereInput = { AND: base };

  const listWhere =
    filters.status === 'COMPLETED' || filters.status === 'CANCELLED'
      ? allWhere
      : filters.tab === 'overdue'
        ? overdueWhere
        : filters.tab === 'today'
          ? todayWhere
          : filters.tab === 'upcoming'
            ? upcomingWhere
            : allWhere;

  const [rows, total, overdue, todayCount, upcoming, all] = await prisma.$transaction([
    prisma.followUp.findMany({
      where: listWhere,
      select: FOLLOW_UP_SELECT,
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.followUp.count({ where: listWhere }),
    prisma.followUp.count({ where: overdueWhere }),
    prisma.followUp.count({ where: todayWhere }),
    prisma.followUp.count({ where: upcomingWhere }),
    prisma.followUp.count({ where: allWhere }),
  ]);

  return {
    rows: await withLeadLastInteraction(rows),
    total,
    counts: { overdue, today: todayCount, upcoming, all },
  };
}

export interface FollowUpTabCounts {
  readonly overdue: number;
  readonly today: number;
  readonly upcoming: number;
  readonly all: number;
}

export async function createFollowUp(data: {
  leadId: string;
  responsavelId: string;
  criadoPorId: string;
  scheduledFor: Date;
  note?: string | null;
}): Promise<FollowUpRow> {
  const row = await prisma.followUp.create({
    data: {
      leadId: data.leadId,
      responsavelId: data.responsavelId,
      criadoPorId: data.criadoPorId,
      scheduledFor: data.scheduledFor,
      note: data.note ?? null,
      status: 'PENDING',
    },
    select: FOLLOW_UP_SELECT,
  });
  const [withResult] = await withLeadLastInteraction([row]);
  return withResult!;
}

export async function findFollowUp(
  id: string,
  scope: Prisma.LeadWhereInput,
): Promise<FollowUpRow | null> {
  const row = await prisma.followUp.findFirst({
    where: { id, lead: scope },
    select: FOLLOW_UP_SELECT,
  });
  if (!row) return null;
  const [withResult] = await withLeadLastInteraction([row]);
  return withResult ?? null;
}

export async function updateFollowUp(
  id: string,
  data: Prisma.FollowUpUpdateInput,
): Promise<FollowUpRow> {
  const row = await prisma.followUp.update({ where: { id }, data, select: FOLLOW_UP_SELECT });
  const [withResult] = await withLeadLastInteraction([row]);
  return withResult!;
}

export async function cancelPendingFollowUps(leadId: string): Promise<number> {
  const result = await prisma.followUp.updateMany({
    where: { leadId, status: { in: ['PENDING', 'OVERDUE'] } },
    data: { status: 'CANCELLED' },
  });
  return result.count;
}

export async function createFollowUpsForLeads(
  leads: readonly { id: string; responsavelId: string | null }[],
  fallbackResponsavelId: string,
  criadoPorId: string,
  scheduledFor: Date,
  note: string | null,
): Promise<number> {
  const result = await prisma.followUp.createMany({
    data: leads.map((lead) => ({
      leadId: lead.id,
      responsavelId: lead.responsavelId ?? fallbackResponsavelId,
      criadoPorId,
      scheduledFor,
      note,
      status: 'PENDING' as const,
    })),
  });
  return result.count;
}

export async function findLeadsForContactQueue(
  scope: Prisma.LeadWhereInput,
  options: { bucket?: ContactBucket | 'all'; offset: number; limit: number },
): Promise<{
  items: Array<FollowUpRow['lead']>;
  counts: Record<ContactBucket, number>;
  nextOffset: number | null;
}> {
  const today = startOfDay();
  const todayEnd = endOfDay();
  const queueWhere: Prisma.LeadWhereInput = {
    AND: [
      scope,
      {
        OR: [
          { nextContactAt: { not: null } },
          { lastContactAt: null, status: { in: ['NEW', 'READY_TO_CONTACT'] } },
          {
            followUps: {
              some: { status: { in: ['PENDING', 'OVERDUE'] }, scheduledFor: { lte: today } },
            },
          },
        ],
      },
    ],
  };

  const bucketWhere: Record<ContactBucket, Prisma.LeadWhereInput> = {
    overdue: { AND: [queueWhere, { nextContactAt: { lt: today } }] },
    today: { AND: [queueWhere, { nextContactAt: { gte: today, lte: todayEnd } }] },
    new: { AND: [queueWhere, { lastContactAt: null, nextContactAt: null }] },
    future: {
      AND: [
        queueWhere,
        {
          OR: [
            { nextContactAt: { gt: todayEnd } },
            { AND: [{ nextContactAt: null }, { NOT: { lastContactAt: null } }] },
          ],
        },
      ],
    },
  };

  const [overdue, todayCount, fresh, future] = await Promise.all([
    prisma.lead.count({ where: bucketWhere.overdue }),
    prisma.lead.count({ where: bucketWhere.today }),
    prisma.lead.count({ where: bucketWhere.new }),
    prisma.lead.count({ where: bucketWhere.future }),
  ]);
  const counts: Record<ContactBucket, number> = {
    overdue,
    today: todayCount,
    new: fresh,
    future,
  };

  const queueSelect = {
    id: true,
    razaoSocial: true,
    nomeFantasia: true,
    whatsapp: true,
    telefone: true,
    email: true,
    cidade: true,
    estado: true,
    status: true,
    lastContactAt: true,
    nextContactAt: true,
    createdAt: true,
  } satisfies Prisma.LeadSelect;

  const fetchBucket = async (bucket: ContactBucket, skip: number, take: number) =>
    prisma.lead.findMany({
      where: bucketWhere[bucket],
      select: queueSelect,
      orderBy: [{ nextContactAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });

  const bucket = options.bucket && options.bucket !== 'all' ? options.bucket : null;
  let rows: Awaited<ReturnType<typeof fetchBucket>> = [];
  let totalForPage: number;

  if (bucket) {
    totalForPage = counts[bucket];
    rows = await fetchBucket(bucket, options.offset, options.limit);
  } else {
    totalForPage = overdue + todayCount + fresh + future;
    const order: ContactBucket[] = ['overdue', 'today', 'new', 'future'];
    let skip = options.offset;
    let remaining = options.limit;
    for (const key of order) {
      if (remaining <= 0) break;
      const size = counts[key];
      if (skip >= size) {
        skip -= size;
        continue;
      }
      const take = Math.min(remaining, size - skip);
      const chunk = await fetchBucket(key, skip, take);
      rows = rows.concat(chunk);
      remaining -= chunk.length;
      skip = 0;
    }
  }

  const nextOffset =
    options.offset + rows.length < totalForPage ? options.offset + rows.length : null;

  return {
    items: await attachLastInteraction(rows),
    counts,
    nextOffset,
  };
}
