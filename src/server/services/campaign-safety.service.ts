import { prisma } from '@/lib/db';
import {
  CAMPAIGN_BURST_COOLDOWN_MS,
  CAMPAIGN_BURST_SIZE,
  CAMPAIGN_DAILY_ATTEMPT_LIMIT,
  CAMPAIGN_FAILURE_PAUSE_THRESHOLD,
} from '@/constants/campaign';
import type { CampaignSendJob } from '@/server/queue/names';
import { removeCampaignJobs } from '@/server/queue/enqueue';
import { BadRequestError } from '@/server/api-handler';
import { campaignDayKey, isCriticalWhatsAppFailure } from '@/lib/campaign-safety';

async function pauseAccountCampaigns(accountId: string, reason: string): Promise<void> {
  const active = await prisma.campaign.findMany({
    where: { whatsappAccountId: accountId, status: 'RUNNING' },
    select: { id: true },
  });
  const now = new Date();
  await prisma.$transaction([
    prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { campaignSafetyPausedAt: now, campaignSafetyPauseReason: reason },
    }),
    prisma.campaign.updateMany({
      where: { whatsappAccountId: accountId, status: 'RUNNING' },
      data: { status: 'PAUSED', pausedAt: now },
    }),
  ]);
  await Promise.all(active.map((campaign) => removeCampaignJobs(campaign.id).catch(() => 0)));
}

export async function pauseCampaignsForCriticalSession(
  accountId: string,
  error: unknown,
): Promise<boolean> {
  if (!isCriticalWhatsAppFailure(error)) return false;
  const message = error instanceof Error ? error.message : String(error ?? 'Falha crítica.');
  await pauseAccountCampaigns(accountId, `Sessão WhatsApp em risco: ${message.slice(0, 300)}`);
  return true;
}

export async function campaignSafetyWaitMs(job: CampaignSendJob, now = new Date()): Promise<number> {
  const row = await prisma.campaignRecipient.findUnique({
    where: { id: job.recipientId },
    select: {
      campaign: {
        select: {
          status: true,
          whatsappAccount: {
            select: {
              campaignSafetyPausedAt: true,
              campaignCooldownUntil: true,
            },
          },
        },
      },
    },
  });
  if (!row || row.campaign.status !== 'RUNNING') return 0;
  const account = row.campaign.whatsappAccount;
  if (!account || account.campaignSafetyPausedAt) return 0;
  return Math.max(0, (account.campaignCooldownUntil?.getTime() ?? 0) - now.getTime());
}

export async function reserveCampaignAttempt(accountId: string, now = new Date()): Promise<boolean> {
  const day = campaignDayKey(now);
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
  if (!account || account.campaignSafetyPausedAt) return false;

  const dailyAttempts = account.campaignSafetyDay === day ? account.campaignDailyAttempts : 0;
  const burstAttempts = account.campaignSafetyDay === day ? account.campaignBurstAttempts : 0;
  if (dailyAttempts >= CAMPAIGN_DAILY_ATTEMPT_LIMIT) {
    await pauseAccountCampaigns(
      accountId,
      `Limite diário de ${CAMPAIGN_DAILY_ATTEMPT_LIMIT} tentativas atingido em ${day}.`,
    );
    return false;
  }

  const nextBurst = burstAttempts + 1;
  await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      campaignSafetyDay: day,
      campaignDailyAttempts: dailyAttempts + 1,
      campaignBurstAttempts: nextBurst >= CAMPAIGN_BURST_SIZE ? 0 : nextBurst,
      campaignCooldownUntil:
        nextBurst >= CAMPAIGN_BURST_SIZE
          ? new Date(now.getTime() + CAMPAIGN_BURST_COOLDOWN_MS)
          : null,
    },
  });
  return true;
}

export async function recordCampaignAttemptSuccess(accountId: string): Promise<void> {
  const account = await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: { campaignConsecutiveFailures: 0 },
    select: { campaignDailyAttempts: true, campaignSafetyDay: true },
  });
  if (account.campaignDailyAttempts >= CAMPAIGN_DAILY_ATTEMPT_LIMIT) {
    await pauseAccountCampaigns(
      accountId,
      `Limite diário de ${CAMPAIGN_DAILY_ATTEMPT_LIMIT} tentativas atingido em ${account.campaignSafetyDay}.`,
    );
  }
}

export async function recordCampaignAttemptFailure(accountId: string, error: unknown): Promise<void> {
  if (await pauseCampaignsForCriticalSession(accountId, error)) return;
  const account = await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: { campaignConsecutiveFailures: { increment: 1 } },
    select: {
      campaignConsecutiveFailures: true,
      campaignDailyAttempts: true,
      campaignSafetyDay: true,
    },
  });
  if (account.campaignDailyAttempts >= CAMPAIGN_DAILY_ATTEMPT_LIMIT) {
    await pauseAccountCampaigns(
      accountId,
      `Limite diário de ${CAMPAIGN_DAILY_ATTEMPT_LIMIT} tentativas atingido em ${account.campaignSafetyDay}.`,
    );
    return;
  }
  if (account.campaignConsecutiveFailures >= CAMPAIGN_FAILURE_PAUSE_THRESHOLD) {
    await pauseAccountCampaigns(
      accountId,
      `${CAMPAIGN_FAILURE_PAUSE_THRESHOLD} falhas consecutivas de campanha. Revise a sessão antes de retomar.`,
    );
  }
}

export async function clearCampaignSafetyPauseForManualResume(accountId: string, now = new Date()) {
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new BadRequestError('Conta WhatsApp não encontrada.');
  const day = campaignDayKey(now);
  const sameDay = account.campaignSafetyDay === day;
  if (
    sameDay &&
    account.campaignDailyAttempts >= CAMPAIGN_DAILY_ATTEMPT_LIMIT
  ) {
    throw new BadRequestError(
      `Limite diário de ${CAMPAIGN_DAILY_ATTEMPT_LIMIT} tentativas atingido. Retome manualmente no próximo dia.`,
    );
  }
  await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      campaignSafetyPausedAt: null,
      campaignSafetyPauseReason: null,
      campaignConsecutiveFailures: 0,
      campaignCooldownUntil: null,
      ...(sameDay
        ? {}
        : { campaignSafetyDay: day, campaignDailyAttempts: 0, campaignBurstAttempts: 0 }),
    },
  });
}
