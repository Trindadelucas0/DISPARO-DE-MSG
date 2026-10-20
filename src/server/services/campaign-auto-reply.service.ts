import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { messageKindFromMedia, messagePreviewFromMedia } from '@/constants/media';
import { type SessionUser, ForbiddenError } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { renderTemplate } from '@/lib/template';
import { matchesAutoReplyRule } from '@/lib/auto-reply';
import { createWhatsAppGateway } from '@/lib/whatsapp';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import { buildLeadTemplateVars } from '@/server/queue/campaign-helpers';
import { recordAudit } from '@/server/services/audit.service';

const responseSchema = z
  .object({
    templateId: z.string().min(1).nullable().default(null),
    body: z.string().trim().max(4000).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.templateId) === Boolean(value.body)) {
      ctx.addIssue({ code: 'custom', message: 'Escolha um template ou informe um texto, não os dois.' });
    }
  });

export const autoReplyConfigSchema = z
  .object({
    enabled: z.boolean(),
    fallback: responseSchema,
    rules: z
      .array(
        z.object({
          matchMode: z.enum(['EQUALS', 'CONTAINS', 'ANY_OF']),
          matchValues: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
          response: responseSchema,
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((value, ctx) => {
    value.rules.forEach((rule, index) => {
      if (rule.matchMode !== 'ANY_OF' && rule.matchValues.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'Igual a e Contém aceitam somente um valor.',
          path: ['rules', index, 'matchValues'],
        });
      }
    });
  });

export type AutoReplyConfigInput = z.infer<typeof autoReplyConfigSchema>;

function assertManager(user: SessionUser) {
  if (user.role === 'USER') throw new ForbiddenError('Somente gestor ou administrador altera automações.');
}

async function assertTemplatesExist(ids: readonly string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  const count = await prisma.messageTemplate.count({ where: { id: { in: unique }, active: true } });
  if (count !== unique.length) throw new BadRequestError('Um dos templates não existe ou está inativo.');
}

export async function getCampaignAutoReply(user: SessionUser, campaignId: string) {
  assertManager(user);
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      autoReplyEnabled: true,
      autoReplyFallbackTemplateId: true,
      autoReplyFallbackBody: true,
      autoReplyRules: { orderBy: { position: 'asc' } },
    },
  });
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  return {
    enabled: campaign.autoReplyEnabled,
    fallback: {
      templateId: campaign.autoReplyFallbackTemplateId,
      body: campaign.autoReplyFallbackBody,
    },
    rules: campaign.autoReplyRules.map((rule) => ({
      id: rule.id,
      matchMode: rule.matchMode,
      matchValues: rule.matchValues,
      response: { templateId: rule.responseTemplateId, body: rule.responseBody },
    })),
  };
}

export async function saveCampaignAutoReply(
  user: SessionUser,
  campaignId: string,
  input: AutoReplyConfigInput,
) {
  assertManager(user);
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, autoReplyEnabled: true } });
  if (!campaign) throw new NotFoundError('Campanha não encontrada.');
  await assertTemplatesExist([
    input.fallback.templateId ?? '',
    ...input.rules.map((rule) => rule.response.templateId ?? ''),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.campaignAutoReplyRule.deleteMany({ where: { campaignId } });
    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        autoReplyEnabled: input.enabled,
        autoReplyFallbackTemplateId: input.fallback.templateId,
        autoReplyFallbackBody: input.fallback.body,
      },
    });
    await tx.campaignAutoReplyRule.createMany({
      data: input.rules.map((rule, position) => ({
        campaignId,
        position,
        matchMode: rule.matchMode,
        matchValues: rule.matchValues,
        responseTemplateId: rule.response.templateId,
        responseBody: rule.response.body,
      })),
    });
  });
  await recordAudit({
    userId: user.id,
    action: input.enabled ? 'campaign.auto_reply.enable' : 'campaign.auto_reply.update',
    entity: 'Campaign',
    entityId: campaignId,
    changes: { enabled: { from: campaign.autoReplyEnabled, to: input.enabled }, rules: input.rules.length },
  });
  await notifyChange({ type: 'campaign.auto_reply', tags: MUTATION_TAGS.campaign, entityId: campaignId });
  return getCampaignAutoReply(user, campaignId);
}

export async function processCampaignAutoReply(input: {
  conversationId: string;
  campaignId: string;
  leadId: string;
  inboundMessageId: string;
  inboundBody: string;
}): Promise<'sent' | 'skipped' | 'failed'> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: {
      autoReplyFallbackTemplate: { include: { media: true } },
      autoReplyRules: { orderBy: { position: 'asc' }, include: { responseTemplate: { include: { media: true } } } },
      whatsappAccount: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!campaign?.autoReplyEnabled || !campaign.whatsappAccount) return 'skipped';
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { campaignId_leadId: { campaignId: input.campaignId, leadId: input.leadId } },
    include: { lead: true },
  });
  if (!recipient) return 'skipped';

  const rule = campaign.autoReplyRules.find((item) =>
    matchesAutoReplyRule(input.inboundBody, item.matchMode, item.matchValues),
  );
  const template = rule?.responseTemplate ?? campaign.autoReplyFallbackTemplate;
  const configuredBody = rule?.responseBody ?? campaign.autoReplyFallbackBody;
  if (!template && !configuredBody?.trim()) return 'skipped';

  let execution;
  try {
    execution = await prisma.campaignAutoReplyExecution.create({
      data: {
        campaignId: campaign.id,
        recipientId: recipient.id,
        ruleId: rule?.id ?? null,
        inboundMessageId: input.inboundMessageId,
        matchedFallback: !rule,
        status: 'PROCESSING',
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'skipped';
    throw error;
  }

  const body = template
    ? renderTemplate(template.body, buildLeadTemplateVars(recipient.lead, { vendedor: campaign.createdBy.name }))
    : configuredBody!.trim();
  const media = template?.media ?? null;
  const kind = messageKindFromMedia(media?.kind, Boolean(template));
  const outbound = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      campaignId: campaign.id,
      templateId: template?.id ?? null,
      mediaId: media?.id ?? null,
      direction: 'OUTBOUND',
      kind,
      body,
      status: 'PENDING',
    },
  });

  try {
    const result = await createWhatsAppGateway(campaign.whatsappAccount).sendMessage({
      accountId: campaign.whatsappAccount.id,
      to: recipient.phone,
      body,
      mediaId: media?.id,
      idempotencyKey: `auto-reply:${execution.id}`,
      conversationId: input.conversationId,
      campaignId: campaign.id,
      leadId: input.leadId,
    });
    const now = new Date();
    await prisma.$transaction([
      prisma.message.update({ where: { id: outbound.id }, data: { status: 'SENT', providerMessageId: result.providerMessageId, sentAt: now } }),
      prisma.campaignAutoReplyExecution.update({ where: { id: execution.id }, data: { status: 'SENT', outboundMessageId: outbound.id, processedAt: now } }),
      prisma.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: now, lastMessagePreview: messagePreviewFromMedia(body, kind) } }),
    ]);
    await recordAudit({ userId: null, action: 'campaign.auto_reply.sent', entity: 'Campaign', entityId: campaign.id, changes: { recipientId: recipient.id, ruleId: rule?.id ?? null } });
    return 'sent';
  } catch (error) {
    const message = ((error as Error).message || 'Falha ao enviar resposta automática.').slice(0, 500);
    await prisma.$transaction([
      prisma.message.update({ where: { id: outbound.id }, data: { status: 'FAILED' } }),
      prisma.campaignAutoReplyExecution.update({ where: { id: execution.id }, data: { status: 'FAILED', outboundMessageId: outbound.id, error: message, processedAt: new Date() } }),
    ]);
    console.error('[auto-reply] envio:', message);
    return 'failed';
  }
}
