import type { CampaignRoutingMode, CampaignStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

import { leadFiltersSchema, type LeadFilters } from '@/features/leads/schema';
import {
  canManageCampaigns,
  ForbiddenError,
  leadScopeWhere,
  type SessionUser,
} from '@/lib/auth/rbac';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { isRedisAvailable } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { toWhatsappNumber } from '@/lib/validation/phone';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import { assertQueueAvailable, enqueueCampaignSend } from '@/server/queue/enqueue';
import { buildLeadWhere } from '@/server/repositories/lead.repository';
import {
  countCampaignFunnelMetrics,
  countFollowUpMetrics,
  countRecipientsByStatus,
  createCampaignDraft,
  createRecipients,
  findCampaign,
  findCampaignRecipientLeadIds,
  findFollowUpEligibleRecipients,
  findFollowUpQueuedRecipients,
  findPendingRecipients,
  findQueuedRecipients,
  listCampaigns,
  listRecipients,
  markFollowUpQueued,
  markRecipientsQueued,
  updateCampaign,
} from '@/server/repositories/campaign.repository';
import { recordAudit } from '@/server/services/audit.service';
import {
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT,
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX,
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN,
  clampFollowUpDelayHours,
  followUpRemainingDelayMs,
} from '@/constants/campaign';
import {
  followUpIdempotencyKey,
  nextRecipientBatch,
  recipientIdempotencyKey,
} from '@/server/queue/campaign-helpers';

export const campaignDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const campaignPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    wizardStep: z.number().int().min(1).max(5).optional(),
    audienceFilter: leadFiltersSchema.optional(),
    excludeOptOut: z.boolean().optional(),
    recipientLimit: z.number().int().min(1).max(100_000).nullable().optional(),
    routingMode: z.enum(['MANUAL', 'CURRENT_OWNER', 'RULES', 'ROUND_ROBIN']).optional(),
    templateId: z.string().min(1).nullable().optional(),
    followUpTemplateId: z.string().min(1).nullable().optional(),
    followUpDelayHours: z
      .number()
      .int()
      .min(CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN)
      .max(CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX)
      .optional(),
    whatsappAccountId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const addRecipientsSchema = z
  .object({
    count: z.number().int().min(1).max(100_000),
  })
  .strict();

const campaignRecipientStatusSchema = z.enum([
  'PENDING',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'SKIPPED',
  'OPTED_OUT',
  'RESPONDED',
]);

function assertManager(user: SessionUser) {
  if (!canManageCampaigns(user)) {
    throw new ForbiddenError('Somente gestor ou administrador cria e dispara campanhas.');
  }
}

function serializeCampaign(
  row: NonNullable<Awaited<ReturnType<typeof findCampaign>>>,
) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    wizardStep: row.wizardStep,
    routingMode: row.routingMode,
    excludeOptOut: row.excludeOptOut,
    recipientLimit: row.recipientLimit,
    audienceFilter: row.audienceFilter as LeadFilters,
    totalCount: row.totalCount,
    withWhatsappCount: row.withWhatsappCount,
    withoutWhatsappCount: row.withoutWhatsappCount,
    optOutCount: row.optOutCount,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    followUpTemplateId: row.followUpTemplateId,
    followUpTemplateName: row.followUpTemplate?.name ?? null,
    followUpDelayHours: row.followUpDelayHours ?? CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT,
    followUpStartedAt: row.followUpStartedAt?.toISOString() ?? null,
    whatsappAccountId: row.whatsappAccountId,
    whatsappAccountName: row.whatsappAccount?.name ?? null,
    whatsappProvider: row.whatsappAccount?.provider ?? null,
    whatsappSessionStatus: row.whatsappAccount?.sessionStatus ?? null,
    createdById: row.createdById,
    createdByNome: row.createdBy.name,
    startedAt: row.startedAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type SerializedCampaign = ReturnType<typeof serializeCampaign>;

export async function createCampaign(user: SessionUser, name: string) {
  assertManager(user);
  const row = await createCampaignDraft({
    name,
    createdById: user.id,
    audienceFilter: leadFiltersSchema.parse({}),
  });
  await recordAudit({
    userId: user.id,
    action: 'campaign.create',
    entity: 'Campaign',
    entityId: row.id,
    changes: { name },
  });
  await notifyChange({ type: 'campaign.create', tags: MUTATION_TAGS.campaign, entityId: row.id });
  const full = await findCampaign(row.id);
  if (!full) throw new NotFoundError('Campanha não encontrada.');
  return serializeCampaign(full);
}

export async function getCampaigns(user: SessionUser, status?: CampaignStatus) {
  assertManager(user);
  const rows = await listCampaigns(status);
  return Promise.all(
    rows.map(async (row) => {
      const full = await findCampaign(row.id);
      if (!full) throw new NotFoundError('Campanha não encontrada.');
      return serializeCampaign(full);
    }),
  );
}

export async function getCampaign(user: SessionUser, id: string) {
  assertManager(user);
  const row = await findCampaign(id);
  if (!row) throw new NotFoundError('Campanha não encontrada.');
  return serializeCampaign(row);
}

export async function patchCampaign(user: SessionUser, id: string, input: z.infer<typeof campaignPatchSchema>) {
  assertManager(user);
  const current = await findCampaign(id);
  if (!current) throw new NotFoundError('Campanha não encontrada.');
  if (
    current.status !== 'DRAFT' &&
    (input.audienceFilter !== undefined ||
      input.templateId !== undefined ||
      input.whatsappAccountId !== undefined ||
      input.recipientLimit !== undefined)
  ) {
    throw new BadRequestError('Só o rascunho aceita mudança de público, quantidade, template ou conta.');
  }

  const data: Prisma.CampaignUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.wizardStep !== undefined) data.wizardStep = input.wizardStep;
  if (input.audienceFilter !== undefined) data.audienceFilter = input.audienceFilter;
  if (input.excludeOptOut !== undefined) data.excludeOptOut = input.excludeOptOut;
  if (input.recipientLimit !== undefined) data.recipientLimit = input.recipientLimit;
  if (input.routingMode !== undefined) data.routingMode = input.routingMode as CampaignRoutingMode;
  if (input.templateId !== undefined) {
    data.template = input.templateId
      ? { connect: { id: input.templateId } }
      : { disconnect: true };
  }
  if (input.followUpTemplateId !== undefined) {
    data.followUpTemplate = input.followUpTemplateId
      ? { connect: { id: input.followUpTemplateId } }
      : { disconnect: true };
  }
  if (input.followUpDelayHours !== undefined) {
    data.followUpDelayHours = clampFollowUpDelayHours(input.followUpDelayHours);
  }
  if (input.whatsappAccountId !== undefined) {
    data.whatsappAccount = input.whatsappAccountId
      ? { connect: { id: input.whatsappAccountId } }
      : { disconnect: true };
  }

  await updateCampaign(id, data);
  const row = await findCampaign(id);
  if (!row) throw new NotFoundError('Campanha não encontrada.');
  await notifyChange({ type: 'campaign.update', tags: MUTATION_TAGS.campaign, entityId: id });
  return serializeCampaign(row);
}

export async function countCampaignAudience(user: SessionUser, filters: LeadFilters, excludeOptOut = true) {
  assertManager(user);
  const scope = leadScopeWhere(user);
  const where = buildLeadWhere(filters, scope);

  const [found, withWhatsapp, sample] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({
      where: { AND: [where, { NOT: { whatsapp: null } }, { whatsapp: { not: '' } }] },
    }),
    prisma.lead.findMany({
      where: filters.ids?.length
        ? where
        : { AND: [where, { NOT: { whatsapp: null } }] },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        cnpj: true,
        razaoSocial: true,
        cidade: true,
        estado: true,
        origem: true,
        whatsapp: true,
        status: true,
      },
    }),
  ]);

  let optOut = 0;
  if (excludeOptOut) {
    optOut = await prisma.optOut.count({
      where: { lead: where },
    });
  }

  return {
    found,
    withWhatsapp,
    withoutWhatsapp: Math.max(0, found - withWhatsapp),
    optOut,
    sample,
  };
}

export async function getCampaignMetrics(user: SessionUser, id: string) {
  assertManager(user);
  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  const byStatus = await countRecipientsByStatus(id);
  const funnel = await countCampaignFunnelMetrics(id);
  const sent = (byStatus.SENT ?? 0) + (byStatus.DELIVERED ?? 0) + (byStatus.RESPONDED ?? 0);
  const followUp = await countFollowUpMetrics(
    id,
    campaign.followUpDelayHours ?? CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT,
  );
  const remainingEligible =
    campaign.status === 'DRAFT'
      ? 0
      : await countRemainingEligible(
          user,
          leadFiltersSchema.parse(campaign.audienceFilter ?? {}),
          campaign.excludeOptOut,
          await findCampaignRecipientLeadIds(id),
        );
  return {
    total: campaign.totalCount,
    sent,
    delivered: (byStatus.DELIVERED ?? 0) + (byStatus.RESPONDED ?? 0),
    failed: byStatus.FAILED ?? 0,
    responded: byStatus.RESPONDED ?? 0,
    pending: (byStatus.PENDING ?? 0) + (byStatus.QUEUED ?? 0),
    optedOut: byStatus.OPTED_OUT ?? 0,
    skipped: byStatus.SKIPPED ?? 0,
    remainingEligible,
    qualified: funnel.qualified,
    meetings: funnel.meetings,
    customers: funnel.customers,
    followUpEligible: followUp.eligible,
    followUpWaitingDelay: followUp.waitingDelay,
    followUpSent: followUp.sent,
    followUpFailed: followUp.failed,
  };
}

export async function getCampaignRecipients(
  user: SessionUser,
  id: string,
  page: number,
  limit: number,
  status?: string,
) {
  assertManager(user);
  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  const parsedStatus = status ? campaignRecipientStatusSchema.safeParse(status) : undefined;
  if (status && parsedStatus && !parsedStatus.success) {
    throw new BadRequestError('Status de destinatário inválido.');
  }
  const { total, rows } = await listRecipients({
    campaignId: id,
    page,
    limit,
    status: parsedStatus?.success ? parsedStatus.data : undefined,
  });
  return {
    total,
    page,
    limit,
    rows: rows.map((row) => ({
      id: row.id,
      leadId: row.leadId,
      phone: row.phone,
      status: row.status,
      error: row.error,
      processedAt: row.processedAt?.toISOString() ?? null,
      cnpj: row.lead.cnpj,
      razaoSocial: row.lead.razaoSocial,
      cidade: row.lead.cidade,
      estado: row.lead.estado,
      leadStatus: row.lead.status,
    })),
  };
}

async function materializeRecipients(
  user: SessionUser,
  campaignId: string,
  filters: LeadFilters,
  excludeOptOut: boolean,
  recipientLimit: number | null,
  existingLeadIds: ReadonlySet<string> = new Set(),
) {
  const where = buildLeadWhere(filters, leadScopeWhere(user));
  const leads = await prisma.lead.findMany({
    where: {
      AND: [where, { NOT: { whatsapp: null } }, { whatsapp: { not: '' } }],
    },
    orderBy: { id: 'asc' },
    select: { id: true, whatsapp: true },
  });

  const optOutSet = new Set<string>();
  if (excludeOptOut && leads.length > 0) {
    const opts = await prisma.optOut.findMany({
      where: { leadId: { in: leads.map((l) => l.id) } },
      select: { leadId: true, phone: true },
    });
    for (const row of opts) optOutSet.add(`${row.leadId}:${row.phone}`);
  }

  const rows: { campaignId: string; leadId: string; phone: string; idempotencyKey: string }[] = [];
  let skippedOptOut = 0;
  let withoutValid = 0;

  for (const lead of leads) {
    const phone = toWhatsappNumber(lead.whatsapp);
    if (!phone) {
      withoutValid += 1;
      continue;
    }
    const digits = phone.replace(/^55/, '');
    if (excludeOptOut && (optOutSet.has(`${lead.id}:${digits}`) || optOutSet.has(`${lead.id}:${lead.whatsapp}`))) {
      skippedOptOut += 1;
      continue;
    }
    rows.push({
      campaignId,
      leadId: lead.id,
      phone: digits,
      idempotencyKey: recipientIdempotencyKey(campaignId, lead.id),
    });
  }

  const limited = nextRecipientBatch(rows, existingLeadIds, recipientLimit);

  // Cria em lotes para não estourar o payload do Prisma.
  const BATCH = 500;
  for (let i = 0; i < limited.length; i += BATCH) {
    await createRecipients(limited.slice(i, i + BATCH));
  }

  return {
    recipientCount: limited.length,
    skippedOptOut,
    withoutValid,
    withWhatsapp: leads.length,
  };
}

async function countRemainingEligible(
  user: SessionUser,
  filters: LeadFilters,
  excludeOptOut: boolean,
  existingLeadIds: string[],
) {
  const where = buildLeadWhere(filters, leadScopeWhere(user));
  const existingFilter: Prisma.LeadWhereInput =
    existingLeadIds.length > 0 ? { id: { notIn: existingLeadIds } } : {};
  const remaining = await prisma.lead.count({
    where: {
      AND: [where, { NOT: { whatsapp: null } }, { whatsapp: { not: '' } }, existingFilter],
    },
  });
  if (!excludeOptOut || remaining === 0) return remaining;
  const optOut = await prisma.optOut.count({
    where: {
      lead: {
        AND: [where, { NOT: { whatsapp: null } }, { whatsapp: { not: '' } }, existingFilter],
      },
    },
  });
  return Math.max(0, remaining - optOut);
}

async function enqueuePendingInitial(campaignId: string): Promise<number> {
  let queued = 0;
  for (;;) {
    const pending = await findPendingRecipients(campaignId, 200);
    if (pending.length === 0) break;
    for (const row of pending) {
      await enqueueCampaignSend({
        campaignId,
        leadId: row.leadId,
        recipientId: row.id,
        idempotencyKey: row.idempotencyKey,
        kind: 'initial',
      });
      await markRecipientsQueued([row.id]);
      queued += 1;
    }
  }
  return queued;
}

async function rescheduleAutomaticFollowUps(
  campaign: NonNullable<Awaited<ReturnType<typeof findCampaign>>>,
) {
  if (!campaign.followUpTemplateId || campaign.followUpTemplateId === campaign.templateId) return;
  const delayHours = campaign.followUpDelayHours ?? CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT;
  for (let skip = 0; ; ) {
    const rows = await prisma.campaignRecipient.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ['SENT', 'DELIVERED'] },
        OR: [{ followUpStatus: null }, { followUpStatus: { in: ['PENDING', 'FAILED'] } }],
      },
      select: { id: true, leadId: true, processedAt: true, followUpStatus: true },
      orderBy: { createdAt: 'asc' },
      skip,
      take: 500,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const key =
        row.followUpStatus === 'FAILED'
          ? followUpIdempotencyKey(campaign.id, row.leadId, Date.now())
          : followUpIdempotencyKey(campaign.id, row.leadId);
      await enqueueCampaignSend(
        {
          campaignId: campaign.id,
          leadId: row.leadId,
          recipientId: row.id,
          idempotencyKey: key,
          kind: 'followup',
        },
        { delayMs: followUpRemainingDelayMs(row.processedAt, delayHours) },
      );
    }
    skip += rows.length;
  }
}

async function revertUnsentDraft(campaignId: string): Promise<void> {
  const progressed = await prisma.campaignRecipient.count({
    where: {
      campaignId,
      status: { notIn: ['PENDING', 'QUEUED'] },
    },
  });
  if (progressed > 0) return;
  await prisma.campaignRecipient.deleteMany({ where: { campaignId } });
  await updateCampaign(campaignId, {
    status: 'DRAFT',
    startedAt: null,
    pausedAt: null,
    totalCount: 0,
    withWhatsappCount: 0,
    withoutWhatsappCount: 0,
    optOutCount: 0,
  });
}

export async function startCampaign(user: SessionUser, id: string) {
  assertManager(user);
  if (!isRedisAvailable()) {
    throw new BadRequestError(
      'Redis está indisponível. Ligue o crm-redis (porta 6380) antes de iniciar a campanha.',
    );
  }
  assertQueueAvailable();

  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
    throw new BadRequestError('Campanha encerrada não inicia de novo.');
  }
  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED' && campaign.status !== 'RUNNING') {
    throw new BadRequestError('Só rascunho, envio ou campanha pausada podem iniciar.');
  }
  if (!campaign.templateId) throw new BadRequestError('Escolha um template antes de iniciar.');
  if (!campaign.whatsappAccountId) throw new BadRequestError('Escolha uma conta WhatsApp.');
  if (campaign.whatsappAccount?.provider === 'LEGACY_MANUAL') {
    throw new BadRequestError('Conta manual (wa.me) não dispara campanha automática.');
  }
  if (
    (campaign.whatsappAccount?.provider === 'CHATWOOT' ||
      campaign.whatsappAccount?.provider === 'EVOLUTION' ||
      campaign.whatsappAccount?.provider === 'BAILEYS') &&
    campaign.whatsappAccount.sessionStatus !== 'CONNECTED'
  ) {
    throw new BadRequestError(
      'A conta WhatsApp precisa estar conectada (escaneie o QR em WhatsApp se for WhatsApp Web).',
    );
  }
  assertCampaignMediaSupported(campaign);

  const filters = leadFiltersSchema.parse(campaign.audienceFilter ?? {});
  const wasDraft = campaign.status === 'DRAFT';

  try {
    if (wasDraft) {
      const audience = await countCampaignAudience(user, filters, campaign.excludeOptOut);
      const material = await materializeRecipients(
        user,
        id,
        filters,
        campaign.excludeOptOut,
        campaign.recipientLimit,
      );
      if (material.recipientCount === 0) {
        throw new BadRequestError('Nenhum destinatário com WhatsApp no público. Ajuste os filtros ou a quantidade.');
      }
      await updateCampaign(id, {
        status: 'RUNNING',
        startedAt: new Date(),
        pausedAt: null,
        totalCount: material.recipientCount,
        withWhatsappCount: material.withWhatsapp,
        withoutWhatsappCount: audience.withoutWhatsapp,
        optOutCount: material.skippedOptOut,
      });
    } else {
      await updateCampaign(id, { status: 'RUNNING', pausedAt: null });
    }

    let queued = 0;
    for (let skip = 0; ; ) {
      const batch = await findQueuedRecipients(id, 500, skip);
      if (batch.length === 0) break;
      for (const row of batch) {
        await enqueueCampaignSend({
          campaignId: id,
          leadId: row.leadId,
          recipientId: row.id,
          idempotencyKey: row.idempotencyKey,
          kind: 'initial',
        });
        queued += 1;
      }
      skip += batch.length;
    }
    queued += await enqueuePendingInitial(id);

    for (let skip = 0; ; ) {
      const batch = await findFollowUpQueuedRecipients(id, 500, skip);
      if (batch.length === 0) break;
      for (const row of batch) {
        const key = row.followUpIdempotencyKey ?? followUpIdempotencyKey(id, row.leadId);
        await enqueueCampaignSend({
          campaignId: id,
          leadId: row.leadId,
          recipientId: row.id,
          idempotencyKey: key,
          kind: 'followup',
        });
      }
      skip += batch.length;
    }

    if (!wasDraft) {
      await rescheduleAutomaticFollowUps(campaign);
    }

    await recordAudit({
      userId: user.id,
      action: 'campaign.start',
      entity: 'Campaign',
      entityId: id,
      changes: { queued },
    });
    await notifyChange({ type: 'campaign.start', tags: MUTATION_TAGS.campaign, entityId: id });

    return getCampaign(user, id);
  } catch (error) {
    if (wasDraft) await revertUnsentDraft(id);
    if (error instanceof BadRequestError || error instanceof NotFoundError) throw error;
    throw new BadRequestError('Falha ao enfileirar o disparo. Tente Iniciar de novo.');
  }
}

function assertCampaignMediaSupported(
  campaign: NonNullable<Awaited<ReturnType<typeof findCampaign>>>,
) {
  const hasMedia = Boolean(campaign.template?.mediaId || campaign.followUpTemplate?.mediaId);
  if (!hasMedia) return;
  const provider = campaign.whatsappAccount?.provider;
  if (provider !== 'BAILEYS' && provider !== 'MOCK') {
    throw new BadRequestError(
      'Template com foto ou vídeo só dispara pela conta WhatsApp Web (QR).',
    );
  }
}

function assertCampaignCanSend(campaign: NonNullable<Awaited<ReturnType<typeof findCampaign>>>) {
  if (!campaign.whatsappAccountId) throw new BadRequestError('Escolha uma conta WhatsApp.');
  if (campaign.whatsappAccount?.provider === 'LEGACY_MANUAL') {
    throw new BadRequestError('Conta manual (wa.me) não dispara campanha automática.');
  }
  if (
    (campaign.whatsappAccount?.provider === 'CHATWOOT' ||
      campaign.whatsappAccount?.provider === 'EVOLUTION' ||
      campaign.whatsappAccount?.provider === 'BAILEYS') &&
    campaign.whatsappAccount.sessionStatus !== 'CONNECTED'
  ) {
    throw new BadRequestError(
      'A conta WhatsApp precisa estar conectada (escaneie o QR em WhatsApp se for WhatsApp Web).',
    );
  }
  assertCampaignMediaSupported(campaign);
}

export async function startCampaignFollowUp(user: SessionUser, id: string) {
  assertManager(user);
  if (!isRedisAvailable()) {
    throw new BadRequestError(
      'Redis está indisponível. Ligue o crm-redis (porta 6380) antes de disparar o retorno.',
    );
  }
  assertQueueAvailable();

  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  if (campaign.status === 'DRAFT') {
    throw new BadRequestError('Inicie o primeiro disparo antes do retorno.');
  }
  if (campaign.status === 'CANCELLED') {
    throw new BadRequestError('Campanha cancelada não dispara retorno.');
  }
  if (campaign.status === 'PAUSED') {
    throw new BadRequestError('Retome a campanha para disparar o retorno. Pausada não envia.');
  }
  if (!campaign.followUpTemplateId) {
    throw new BadRequestError('Escolha o template de retorno antes de disparar.');
  }
  if (campaign.followUpTemplateId === campaign.templateId) {
    throw new BadRequestError('O retorno precisa de um template diferente da primeira mensagem.');
  }
  assertCampaignCanSend(campaign);

  const delayHours = campaign.followUpDelayHours ?? CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT;
  let queued = 0;
  for (let skip = 0; ; ) {
    const batch = await findFollowUpQueuedRecipients(id, 500, skip);
    if (batch.length === 0) break;
    for (const row of batch) {
      const key = row.followUpIdempotencyKey ?? followUpIdempotencyKey(id, row.leadId);
      await enqueueCampaignSend({
        campaignId: id,
        leadId: row.leadId,
        recipientId: row.id,
        idempotencyKey: key,
        kind: 'followup',
      });
      queued += 1;
    }
    skip += batch.length;
  }
  for (;;) {
    const batch = await findFollowUpEligibleRecipients(id, delayHours, 200);
    if (batch.length === 0) break;
    const marked: { id: string; followUpIdempotencyKey: string }[] = [];
    for (const row of batch) {
      const key =
        row.followUpStatus === 'FAILED'
          ? followUpIdempotencyKey(id, row.leadId, Date.now())
          : (row.followUpIdempotencyKey ?? followUpIdempotencyKey(id, row.leadId));
      await enqueueCampaignSend({
        campaignId: id,
        leadId: row.leadId,
        recipientId: row.id,
        idempotencyKey: key,
        kind: 'followup',
      });
      marked.push({ id: row.id, followUpIdempotencyKey: key });
      queued += 1;
    }
    await markFollowUpQueued(marked);
  }

  if (queued === 0) {
    const followUp = await countFollowUpMetrics(id, delayHours);
    if (followUp.waitingDelay > 0) {
      throw new BadRequestError(
        `Nenhum contato no intervalo ainda. ${followUp.waitingDelay} ainda esperam as ${delayHours} h após a primeira mensagem.`,
      );
    }
    if (followUp.sent > 0) {
      throw new BadRequestError('O retorno já foi enviado a todos os elegíveis. Quem respondeu não entra de novo.');
    }
    throw new BadRequestError(
      'Nenhum contato elegível. Só entra quem recebeu a primeira mensagem, não respondeu e já passou o intervalo.',
    );
  }

  if (!campaign.followUpStartedAt) {
    await updateCampaign(id, { followUpStartedAt: new Date() });
  }

  await recordAudit({
    userId: user.id,
    action: 'campaign.followup',
    entity: 'Campaign',
    entityId: id,
    changes: { queued, delayHours },
  });
  await notifyChange({ type: 'campaign.followup', tags: MUTATION_TAGS.campaign, entityId: id });
  return getCampaign(user, id);
}

export async function addCampaignRecipients(
  user: SessionUser,
  id: string,
  count: number,
) {
  assertManager(user);
  if (!isRedisAvailable()) {
    throw new BadRequestError(
      'Redis está indisponível. Ligue o crm-redis (porta 6380) antes de adicionar destinatários.',
    );
  }
  assertQueueAvailable();

  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  if (campaign.status === 'DRAFT') {
    throw new BadRequestError('Inicie o primeiro disparo antes de adicionar mais destinatários.');
  }
  if (campaign.status === 'CANCELLED') {
    throw new BadRequestError('Campanha cancelada não recebe mais destinatários.');
  }
  if (!campaign.templateId) throw new BadRequestError('Campanha sem template da primeira mensagem.');
  assertCampaignCanSend(campaign);

  const filters = leadFiltersSchema.parse(campaign.audienceFilter ?? {});
  const existing = new Set(await findCampaignRecipientLeadIds(id));
  const material = await materializeRecipients(
    user,
    id,
    filters,
    campaign.excludeOptOut,
    count,
    existing,
  );
  if (material.recipientCount === 0) {
    throw new BadRequestError(
      'Nenhum contato restante no público. Quem já está nesta campanha não entra de novo.',
    );
  }

  const nextStatus = campaign.status === 'PAUSED' ? 'PAUSED' : 'RUNNING';
  await updateCampaign(id, {
    status: nextStatus,
    completedAt: nextStatus === 'RUNNING' ? null : campaign.completedAt,
    totalCount: { increment: material.recipientCount },
  });

  let queued = 0;
  if (nextStatus !== 'PAUSED') {
    queued = await enqueuePendingInitial(id);
  }

  await recordAudit({
    userId: user.id,
    action: 'campaign.recipients.add',
    entity: 'Campaign',
    entityId: id,
    changes: { added: material.recipientCount, queued, count },
  });
  await notifyChange({ type: 'campaign.update', tags: MUTATION_TAGS.campaign, entityId: id });
  return getCampaign(user, id);
}

export async function pauseCampaign(user: SessionUser, id: string) {
  assertManager(user);
  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  if (campaign.status !== 'RUNNING') throw new BadRequestError('Só campanha em envio pode pausar.');
  await updateCampaign(id, { status: 'PAUSED', pausedAt: new Date() });
  await recordAudit({ userId: user.id, action: 'campaign.pause', entity: 'Campaign', entityId: id });
  await notifyChange({ type: 'campaign.pause', tags: MUTATION_TAGS.campaign, entityId: id });
  return getCampaign(user, id);
}

export async function resumeCampaign(user: SessionUser, id: string) {
  return startCampaign(user, id);
}

export async function cancelCampaign(user: SessionUser, id: string) {
  assertManager(user);
  const campaign = await findCampaign(id);
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
    throw new BadRequestError('Campanha já encerrada.');
  }
  await updateCampaign(id, { status: 'CANCELLED', cancelledAt: new Date() });
  await prisma.campaignRecipient.updateMany({
    where: { campaignId: id, status: { in: ['PENDING', 'QUEUED'] } },
    data: { status: 'SKIPPED', error: 'Campanha cancelada.', processedAt: new Date() },
  });
  await recordAudit({ userId: user.id, action: 'campaign.cancel', entity: 'Campaign', entityId: id });
  await notifyChange({ type: 'campaign.cancel', tags: MUTATION_TAGS.campaign, entityId: id });
  return getCampaign(user, id);
}
