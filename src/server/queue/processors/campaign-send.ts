import { CampaignRecipientStatus, CampaignStatus } from '@prisma/client';

import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { renderTemplate } from '@/lib/template';
import { createWhatsAppGateway } from '@/lib/whatsapp';
import { GatewayNotCapableError } from '@/lib/whatsapp/gateway';
import { prisma } from '@/lib/db';
import {
  CAMPAIGN_FOLLOW_UP_PAUSE_RETRY_MS,
  followUpDelayMs,
  followUpRemainingDelayMs,
  followUpSkipReason,
  isFollowUpAlreadySent,
  SENT_RECIPIENT_STATUSES,
} from '@/constants/campaign';
import { messageKindFromMedia, messagePreviewFromMedia } from '@/constants/media';
import { buildLeadTemplateVars, followUpIdempotencyKey } from '@/server/queue/campaign-helpers';
import type { CampaignSendJob } from '@/server/queue/names';
import { enqueueCampaignSend, enqueueConversationRouting } from '@/server/queue/enqueue';
import { findOpenConversationForCampaign } from '@/server/repositories/conversation.repository';
import { markLeadContactedOnOutbound } from '@/server/services/lead-funnel';

type RecipientWithCampaign = NonNullable<Awaited<ReturnType<typeof loadRecipient>>>;

async function loadRecipient(recipientId: string) {
  return prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: {
      campaign: {
        include: {
          template: true,
          followUpTemplate: true,
          whatsappAccount: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
      lead: true,
    },
  });
}

/**
 * Processa um destinatário. Idempotente: se já enviado/entregue/respondido,
 * ou se já existe providerMessageId, não reenvia.
 * `kind: followup` usa o template de retorno e não reenvia a primeira onda.
 */
export async function processCampaignSendJob(job: CampaignSendJob): Promise<'sent' | 'skipped'> {
  const recipient = await loadRecipient(job.recipientId);
  if (!recipient) return 'skipped';
  if (recipient.campaignId !== job.campaignId || recipient.leadId !== job.leadId) return 'skipped';

  const kind = job.kind ?? 'initial';
  if (kind === 'followup') {
    return processFollowUpSend(job, recipient);
  }
  return processInitialSend(job, recipient);
}

async function processInitialSend(
  job: CampaignSendJob,
  recipient: RecipientWithCampaign,
): Promise<'sent' | 'skipped'> {
  const campaign = recipient.campaign;
  if (campaign.status === CampaignStatus.PAUSED || campaign.status === CampaignStatus.CANCELLED) {
    return 'skipped';
  }

  if ((SENT_RECIPIENT_STATUSES as readonly string[]).includes(recipient.status)) {
    return 'skipped';
  }
  if (recipient.status === CampaignRecipientStatus.OPTED_OUT || recipient.status === CampaignRecipientStatus.SKIPPED) {
    return 'skipped';
  }

  if (campaign.excludeOptOut) {
    const opted = await prisma.optOut.findUnique({
      where: {
        leadId_phone: { leadId: recipient.leadId, phone: recipient.phone },
      },
    });
    if (opted) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: CampaignRecipientStatus.OPTED_OUT,
          error: 'Lead em opt-out.',
          processedAt: new Date(),
        },
      });
      return 'skipped';
    }
  }

  const account = campaign.whatsappAccount;
  if (!account || !campaign.template) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.FAILED,
        error: 'Campanha sem conta WhatsApp ou template.',
        processedAt: new Date(),
      },
    });
    return 'skipped';
  }

  if (account.provider === 'LEGACY_MANUAL') {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.FAILED,
        error: 'Conta manual (wa.me) não dispara campanha.',
        processedAt: new Date(),
      },
    });
    return 'skipped';
  }

  const existingMessage = await prisma.message.findFirst({
    where: {
      campaignId: campaign.id,
      conversation: { leadId: recipient.leadId },
      providerMessageId: { not: null },
      ...(campaign.followUpTemplateId
        ? { NOT: { templateId: campaign.followUpTemplateId } }
        : {}),
    },
  });
  if (existingMessage?.providerMessageId) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.SENT,
        processedAt: new Date(),
        error: null,
      },
    });
    await scheduleAutomaticFollowUp(recipient);
    return 'skipped';
  }

  return dispatchCampaignMessage({
    job,
    recipient,
    account,
    templateId: campaign.template.id,
    templateBody: campaign.template.body,
    templateMediaId: campaign.template.mediaId,
    idempotencyKey: recipient.idempotencyKey,
    wave: 'initial',
  });
}

async function processFollowUpSend(
  job: CampaignSendJob,
  recipient: RecipientWithCampaign,
): Promise<'sent' | 'skipped'> {
  const campaign = recipient.campaign;
  if (campaign.status === CampaignStatus.CANCELLED) {
    return 'skipped';
  }
  if (campaign.status === CampaignStatus.PAUSED) {
    return 'skipped';
  }

  if (isFollowUpAlreadySent(recipient.followUpStatus)) {
    return 'skipped';
  }

  const inbound = await hasInboundReply(recipient.leadId, campaign.whatsappAccountId);
  if (inbound && recipient.status !== CampaignRecipientStatus.RESPONDED) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: CampaignRecipientStatus.RESPONDED, processedAt: new Date() },
    });
  }

  const skip = followUpSkipReason({
    status: inbound ? 'RESPONDED' : recipient.status,
    followUpStatus: recipient.followUpStatus,
    processedAt: recipient.processedAt,
    delayHours: campaign.followUpDelayHours,
  });
  if (skip === 'responded' || skip === 'opted_out' || skip === 'skipped' || skip === 'not_sent' || skip === 'already_sent') {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        followUpStatus: CampaignRecipientStatus.SKIPPED,
        followUpError:
          skip === 'responded'
            ? 'Lead respondeu. Retorno não enviado.'
            : skip === 'opted_out'
              ? 'Lead em opt-out.'
              : 'Destinatário fora do retorno.',
        followUpProcessedAt: new Date(),
      },
    });
    return 'skipped';
  }
  if (skip === 'too_soon') {
    const remaining = followUpRemainingDelayMs(recipient.processedAt, campaign.followUpDelayHours);
    await requeueFollowUp(job, Math.max(remaining, CAMPAIGN_FOLLOW_UP_PAUSE_RETRY_MS));
    return 'skipped';
  }

  if (campaign.excludeOptOut) {
    const opted = await prisma.optOut.findUnique({
      where: {
        leadId_phone: { leadId: recipient.leadId, phone: recipient.phone },
      },
    });
    if (opted) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          followUpStatus: CampaignRecipientStatus.OPTED_OUT,
          followUpError: 'Lead em opt-out.',
          followUpProcessedAt: new Date(),
        },
      });
      return 'skipped';
    }
  }

  const account = campaign.whatsappAccount;
  const followUpTemplate = campaign.followUpTemplate;
  if (!account || !followUpTemplate) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        followUpStatus: CampaignRecipientStatus.FAILED,
        followUpError: 'Campanha sem conta WhatsApp ou template de retorno.',
        followUpProcessedAt: new Date(),
      },
    });
    return 'skipped';
  }

  if (account.provider === 'LEGACY_MANUAL') {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        followUpStatus: CampaignRecipientStatus.FAILED,
        followUpError: 'Conta manual (wa.me) não dispara campanha.',
        followUpProcessedAt: new Date(),
      },
    });
    return 'skipped';
  }

  const existingFollowUp = await prisma.message.findFirst({
    where: {
      campaignId: campaign.id,
      templateId: followUpTemplate.id,
      conversation: { leadId: recipient.leadId },
      providerMessageId: { not: null },
    },
  });
  if (existingFollowUp?.providerMessageId) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        followUpStatus: CampaignRecipientStatus.SENT,
        followUpProcessedAt: new Date(),
        followUpError: null,
      },
    });
    return 'skipped';
  }

  const idempotencyKey = recipient.followUpIdempotencyKey ?? job.idempotencyKey;

  return dispatchCampaignMessage({
    job,
    recipient,
    account,
    templateId: followUpTemplate.id,
    templateBody: followUpTemplate.body,
    templateMediaId: followUpTemplate.mediaId,
    idempotencyKey,
    wave: 'followup',
  });
}

async function hasInboundReply(leadId: string, whatsappAccountId: string | null): Promise<boolean> {
  if (!whatsappAccountId) return false;
  const inbound = await prisma.message.findFirst({
    where: {
      direction: 'INBOUND',
      conversation: { leadId, whatsappAccountId },
    },
    select: { id: true },
  });
  return Boolean(inbound);
}

async function dispatchCampaignMessage(input: {
  job: CampaignSendJob;
  recipient: RecipientWithCampaign;
  account: NonNullable<RecipientWithCampaign['campaign']['whatsappAccount']>;
  templateId: string;
  templateBody: string;
  templateMediaId?: string | null;
  idempotencyKey: string;
  wave: 'initial' | 'followup';
}): Promise<'sent' | 'skipped'> {
  const { recipient, account, templateId, templateBody, templateMediaId, idempotencyKey, wave } = input;
  const campaign = recipient.campaign;
  const isFollowUp = wave === 'followup';

  const body = renderTemplate(
    templateBody,
    buildLeadTemplateVars(recipient.lead, {
      vendedor: campaign.createdBy.name,
      responsavel: recipient.lead.responsavelId ? undefined : campaign.createdBy.name,
    }),
  );

  const media = templateMediaId
    ? await prisma.mediaAsset.findUnique({
        where: { id: templateMediaId },
        select: { id: true, kind: true },
      })
    : null;
  if (templateMediaId && !media) {
    throw new Error('Mídia do template não está mais disponível.');
  }
  const kind = messageKindFromMedia(media?.kind, true);
  const preview = messagePreviewFromMedia(body, kind);

  let conversation = await findOpenConversationForCampaign(
    recipient.leadId,
    account.id,
    campaign.id,
  );

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        leadId: recipient.leadId,
        whatsappAccountId: account.id,
        campaignId: campaign.id,
        phone: recipient.phone,
        status: 'WAITING',
        lastMessageAt: new Date(),
        lastMessagePreview: preview,
      },
    });
  }

  const pending = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      campaignId: campaign.id,
      templateId,
      mediaId: media?.id ?? null,
      direction: 'OUTBOUND',
      kind,
      body,
      status: 'PENDING',
    },
  });

  try {
    const gateway = createWhatsAppGateway(account);
    const result = await gateway.sendMessage({
      accountId: account.id,
      to: recipient.phone,
      body,
      mediaId: media?.id,
      idempotencyKey,
      conversationId: conversation.id,
      campaignId: campaign.id,
      leadId: recipient.leadId,
    });

    await prisma.$transaction([
      prisma.message.update({
        where: { id: pending.id },
        data: {
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      }),
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: isFollowUp
          ? {
              followUpStatus: CampaignRecipientStatus.SENT,
              followUpProcessedAt: new Date(),
              followUpError: null,
            }
          : {
              status: CampaignRecipientStatus.SENT,
              processedAt: new Date(),
              error: null,
            },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: preview,
          campaignId: campaign.id,
        },
      }),
      prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: { lastHeartbeatAt: new Date(), sessionStatus: 'CONNECTED', status: 'ACTIVE' },
      }),
    ]);

    if (!conversation.assignedUserId) {
      await enqueueConversationRouting({
        conversationId: conversation.id,
        campaignId: campaign.id,
      }).catch(() => undefined);
    }

    await notifyChange({
      type: isFollowUp ? 'campaign.followup' : 'campaign.send',
      tags: [...MUTATION_TAGS.campaign, ...MUTATION_TAGS.conversation],
      entityId: campaign.id,
    });

    if (!isFollowUp) {
      await markLeadContactedOnOutbound(recipient.leadId).catch((error: Error) => {
        console.error('[campaign] funil após envio:', error.message);
      });
      await scheduleAutomaticFollowUp(recipient);
    }

    return 'sent';
  } catch (error) {
    const message =
      error instanceof GatewayNotCapableError
        ? error.message
        : (error as Error).message || 'Falha no envio.';
    await prisma.$transaction([
      prisma.message.update({
        where: { id: pending.id },
        data: { status: 'FAILED' },
      }),
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: isFollowUp
          ? {
              followUpStatus: CampaignRecipientStatus.FAILED,
              followUpError: message.slice(0, 500),
              followUpProcessedAt: new Date(),
            }
          : {
              status: CampaignRecipientStatus.FAILED,
              error: message.slice(0, 500),
              processedAt: new Date(),
            },
      }),
    ]);
    throw error;
  }
}

async function scheduleAutomaticFollowUp(recipient: RecipientWithCampaign): Promise<void> {
  const campaign = recipient.campaign;
  if (!campaign.followUpTemplateId) return;
  if (campaign.followUpTemplateId === campaign.templateId) return;
  if (campaign.status === CampaignStatus.CANCELLED || campaign.status === CampaignStatus.PAUSED) {
    return;
  }
  const key = followUpIdempotencyKey(campaign.id, recipient.leadId);
  await enqueueCampaignSend(
    {
      campaignId: campaign.id,
      leadId: recipient.leadId,
      recipientId: recipient.id,
      idempotencyKey: key,
      kind: 'followup',
    },
    { delayMs: followUpDelayMs(campaign.followUpDelayHours) },
  ).catch((error: Error) => {
    console.error('[campaign] agendar retorno:', error.message);
  });
}

async function requeueFollowUp(job: CampaignSendJob, delayMs: number): Promise<void> {
  await enqueueCampaignSend(
    {
      campaignId: job.campaignId,
      leadId: job.leadId,
      recipientId: job.recipientId,
      idempotencyKey: followUpIdempotencyKey(job.campaignId, job.leadId, Date.now()),
      kind: 'followup',
    },
    { delayMs },
  ).catch((error: Error) => {
    console.error('[campaign] recolocar retorno:', error.message);
  });
}
