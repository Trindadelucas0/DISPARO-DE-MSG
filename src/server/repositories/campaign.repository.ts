import type { CampaignRecipientStatus, CampaignStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

export const CAMPAIGN_LIST_SELECT = {
  id: true,
  name: true,
  status: true,
  wizardStep: true,
  routingMode: true,
  excludeOptOut: true,
  recipientLimit: true,
  totalCount: true,
  withWhatsappCount: true,
  withoutWhatsappCount: true,
  optOutCount: true,
  startedAt: true,
  pausedAt: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  templateId: true,
  followUpTemplateId: true,
  followUpDelayHours: true,
  followUpStartedAt: true,
  whatsappAccountId: true,
  createdById: true,
  template: { select: { id: true, name: true, mediaId: true } },
  followUpTemplate: { select: { id: true, name: true, mediaId: true } },
  whatsappAccount: { select: { id: true, name: true, phone: true, provider: true, sessionStatus: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CampaignSelect;

export async function createCampaignDraft(data: {
  name: string;
  createdById: string;
  audienceFilter: Prisma.InputJsonValue;
}) {
  return prisma.campaign.create({
    data: {
      name: data.name,
      createdById: data.createdById,
      audienceFilter: data.audienceFilter,
      status: 'DRAFT',
      wizardStep: 1,
    },
    select: CAMPAIGN_LIST_SELECT,
  });
}

export async function updateCampaign(
  id: string,
  data: Prisma.CampaignUpdateInput,
) {
  return prisma.campaign.update({
    where: { id },
    data,
    select: CAMPAIGN_LIST_SELECT,
  });
}

export async function findCampaign(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    select: { ...CAMPAIGN_LIST_SELECT, audienceFilter: true },
  });
}

export async function listCampaigns(status?: CampaignStatus) {
  return prisma.campaign.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: CAMPAIGN_LIST_SELECT,
  });
}

export async function findCampaignRecipientLeadIds(campaignId: string): Promise<string[]> {
  const rows = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { leadId: true },
  });
  return rows.map((row) => row.leadId);
}

export async function createRecipients(
  rows: ReadonlyArray<{
    campaignId: string;
    leadId: string;
    phone: string;
    idempotencyKey: string;
  }>,
) {
  if (rows.length === 0) return { count: 0 };
  return prisma.campaignRecipient.createMany({
    data: rows.map((row) => ({ ...row, status: 'PENDING' as CampaignRecipientStatus })),
    skipDuplicates: true,
  });
}

export async function listRecipients(params: {
  campaignId: string;
  status?: CampaignRecipientStatus;
  page: number;
  limit: number;
}) {
  const where: Prisma.CampaignRecipientWhereInput = {
    campaignId: params.campaignId,
    ...(params.status ? { status: params.status } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.campaignRecipient.count({ where }),
    prisma.campaignRecipient.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: {
        lead: {
          select: {
            id: true,
            cnpj: true,
            razaoSocial: true,
            cidade: true,
            estado: true,
            status: true,
          },
        },
      },
    }),
  ]);
  return { total, rows };
}

export async function countRecipientsByStatus(campaignId: string) {
  const groups = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Partial<
    Record<CampaignRecipientStatus, number>
  >;
}

export async function countCampaignFunnelMetrics(campaignId: string) {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { leadId: true },
  });
  const leadIds = recipients.map((r) => r.leadId);
  if (leadIds.length === 0) {
    return { qualified: 0, meetings: 0, customers: 0 };
  }
  const [qualified, meetings, customers] = await Promise.all([
    prisma.lead.count({ where: { id: { in: leadIds }, status: 'QUALIFIED' } }),
    prisma.lead.count({ where: { id: { in: leadIds }, status: 'NEGOTIATION' } }),
    prisma.lead.count({ where: { id: { in: leadIds }, status: 'CUSTOMER' } }),
  ]);
  return { qualified, meetings, customers };
}

export async function findPendingRecipients(campaignId: string, take = 500) {
  return prisma.campaignRecipient.findMany({
    where: { campaignId, status: 'PENDING' },
    take,
    orderBy: { createdAt: 'asc' },
  });
}

export async function findQueuedRecipients(campaignId: string, take = 500, skip = 0) {
  return prisma.campaignRecipient.findMany({
    where: { campaignId, status: 'QUEUED' },
    skip,
    take,
    orderBy: { createdAt: 'asc' },
  });
}

export async function markRecipientsQueued(ids: readonly string[]) {
  if (ids.length === 0) return;
  await prisma.campaignRecipient.updateMany({
    where: { id: { in: [...ids] } },
    data: { status: 'QUEUED', queuedAt: new Date() },
  });
}

const FOLLOW_UP_OPEN: Prisma.CampaignRecipientWhereInput = {
  OR: [{ followUpStatus: null }, { followUpStatus: { in: ['PENDING', 'FAILED'] } }],
};

export function followUpEligibleWhere(
  campaignId: string,
  delayHours: number,
  now = new Date(),
): Prisma.CampaignRecipientWhereInput {
  const cutoff = new Date(now.getTime() - delayHours * 3_600_000);
  return {
    campaignId,
    status: { in: ['SENT', 'DELIVERED'] },
    processedAt: { lte: cutoff },
    AND: [FOLLOW_UP_OPEN],
  };
}

export async function findFollowUpEligibleRecipients(
  campaignId: string,
  delayHours: number,
  take = 200,
) {
  return prisma.campaignRecipient.findMany({
    where: followUpEligibleWhere(campaignId, delayHours),
    take,
    orderBy: { processedAt: 'asc' },
  });
}

export async function findFollowUpQueuedRecipients(campaignId: string, take = 500, skip = 0) {
  return prisma.campaignRecipient.findMany({
    where: { campaignId, followUpStatus: 'QUEUED' },
    skip,
    take,
    orderBy: { followUpQueuedAt: 'asc' },
  });
}

export async function markFollowUpQueued(
  rows: ReadonlyArray<{ id: string; followUpIdempotencyKey: string }>,
) {
  if (rows.length === 0) return;
  const now = new Date();
  await prisma.$transaction(
    rows.map((row) =>
      prisma.campaignRecipient.update({
        where: { id: row.id },
        data: {
          followUpStatus: 'QUEUED',
          followUpQueuedAt: now,
          followUpError: null,
          followUpIdempotencyKey: row.followUpIdempotencyKey,
        },
      }),
    ),
  );
}

export async function countFollowUpMetrics(campaignId: string, delayHours: number) {
  const cutoff = new Date(Date.now() - delayHours * 3_600_000);
  const firstWaveSent: Prisma.CampaignRecipientWhereInput = {
    campaignId,
    status: { in: ['SENT', 'DELIVERED'] },
  };
  const [eligible, waitingDelay, sent, failed] = await Promise.all([
    prisma.campaignRecipient.count({
      where: followUpEligibleWhere(campaignId, delayHours),
    }),
    prisma.campaignRecipient.count({
      where: {
        ...firstWaveSent,
        processedAt: { gt: cutoff },
        AND: [FOLLOW_UP_OPEN],
      },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, followUpStatus: { in: ['SENT', 'DELIVERED'] } },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, followUpStatus: 'FAILED' },
    }),
  ]);
  return { eligible, waitingDelay, sent, failed };
}
