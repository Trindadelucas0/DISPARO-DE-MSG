import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT,
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX,
  CAMPAIGN_FOLLOW_UP_PAUSE_RETRY_MS,
  CAMPAIGN_SENDS_PER_MINUTE,
  campaignSendIntervalMs,
  clampFollowUpDelayHours,
  estimateCampaignMinutes,
  followUpDelayMs,
  followUpRemainingDelayMs,
  followUpSkipReason,
  isFollowUpEligible,
} from '@/constants/campaign';

describe('cadência de campanha', () => {
  it('é 5 disparos por minuto, 1 a cada 12 s', () => {
    expect(CAMPAIGN_SENDS_PER_MINUTE).toBe(5);
    expect(campaignSendIntervalMs()).toBe(12_000);
  });

  it('estima minutos restantes', () => {
    expect(estimateCampaignMinutes(0)).toBe(0);
    expect(estimateCampaignMinutes(-1)).toBe(0);
    expect(estimateCampaignMinutes(1)).toBe(1);
    expect(estimateCampaignMinutes(5)).toBe(1);
    expect(estimateCampaignMinutes(6)).toBe(2);
    expect(estimateCampaignMinutes(100)).toBe(20);
    expect(estimateCampaignMinutes(1_000)).toBe(200);
  });
});

describe('retorno de campanha', () => {
  const now = new Date('2026-09-08T15:00:00.000Z');
  const sentThreeHoursAgo = new Date('2026-09-08T12:00:00.000Z');
  const sentOneHourAgo = new Date('2026-09-08T14:00:00.000Z');
  const sentTwoHoursAgo = new Date('2026-09-08T13:00:00.000Z');

  it('atraso padrão é 2 h e o teto é 72', () => {
    expect(CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT).toBe(2);
    expect(CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX).toBe(72);
    expect(CAMPAIGN_FOLLOW_UP_PAUSE_RETRY_MS).toBe(60_000);
    expect(clampFollowUpDelayHours(0)).toBe(1);
    expect(clampFollowUpDelayHours(2)).toBe(2);
    expect(clampFollowUpDelayHours(80)).toBe(72);
    expect(followUpDelayMs(2)).toBe(7_200_000);
  });

  it('resta delay quando ainda não passou o intervalo', () => {
    expect(followUpRemainingDelayMs(sentOneHourAgo, 2, now)).toBe(3_600_000);
    expect(followUpRemainingDelayMs(sentTwoHoursAgo, 2, now)).toBe(0);
    expect(followUpRemainingDelayMs(null, 2, now)).toBe(7_200_000);
  });

  it('não entra quem ainda não recebeu a primeira mensagem', () => {
    expect(
      followUpSkipReason({
        status: 'QUEUED',
        followUpStatus: null,
        processedAt: sentThreeHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe('not_sent');
    expect(
      followUpSkipReason({
        status: 'FAILED',
        followUpStatus: null,
        processedAt: sentThreeHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe('not_sent');
  });

  it('não entra quem respondeu, opt-out ou já recebeu o retorno', () => {
    expect(
      followUpSkipReason({
        status: 'RESPONDED',
        followUpStatus: null,
        processedAt: sentThreeHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe('responded');
    expect(
      followUpSkipReason({
        status: 'OPTED_OUT',
        followUpStatus: null,
        processedAt: sentThreeHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe('opted_out');
    expect(
      followUpSkipReason({
        status: 'SENT',
        followUpStatus: 'SENT',
        processedAt: sentThreeHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe('already_sent');
  });

  it('não entra antes do intervalo', () => {
    expect(
      followUpSkipReason({
        status: 'SENT',
        followUpStatus: null,
        processedAt: sentOneHourAgo,
        delayHours: 2,
        now,
      }),
    ).toBe('too_soon');
    expect(
      isFollowUpEligible({
        status: 'SENT',
        followUpStatus: null,
        processedAt: sentOneHourAgo,
        delayHours: 2,
        now,
      }),
    ).toBe(false);
  });

  it('entra quem recebeu, não respondeu e já passou o intervalo', () => {
    expect(
      isFollowUpEligible({
        status: 'SENT',
        followUpStatus: null,
        processedAt: sentTwoHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe(true);
    expect(
      isFollowUpEligible({
        status: 'DELIVERED',
        followUpStatus: 'FAILED',
        processedAt: sentThreeHoursAgo,
        delayHours: 2,
        now,
      }),
    ).toBe(true);
  });
});
