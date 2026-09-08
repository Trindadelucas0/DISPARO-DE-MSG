import type { CampaignRecipientStatus, CampaignRoutingMode, CampaignStatus } from '@prisma/client';

export interface CampaignStatusMeta {
  readonly value: CampaignStatus;
  readonly label: string;
  readonly description: string;
}

export const CAMPAIGN_STATUS_META: Readonly<Record<CampaignStatus, CampaignStatusMeta>> = {
  DRAFT: { value: 'DRAFT', label: 'Rascunho', description: 'Ainda no formulário. Não envia.' },
  RUNNING: { value: 'RUNNING', label: 'Em envio', description: 'A fila está processando destinatários.' },
  PAUSED: { value: 'PAUSED', label: 'Pausada', description: 'Novos envios não entram na fila.' },
  COMPLETED: { value: 'COMPLETED', label: 'Concluída', description: 'Não restam destinatários pendentes.' },
  CANCELLED: { value: 'CANCELLED', label: 'Cancelada', description: 'Envio interrompido. Pendentes não saem.' },
};

export const CAMPAIGN_STATUS_ORDER: readonly CampaignStatus[] = [
  'DRAFT',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
];

export function campaignStatusLabel(status: CampaignStatus): string {
  return CAMPAIGN_STATUS_META[status].label;
}

export const CAMPAIGN_RECIPIENT_STATUS_META: Readonly<
  Record<CampaignRecipientStatus, { readonly label: string }>
> = {
  PENDING: { label: 'Pendente' },
  QUEUED: { label: 'Na fila' },
  SENT: { label: 'Enviado' },
  DELIVERED: { label: 'Entregue' },
  FAILED: { label: 'Falhou' },
  SKIPPED: { label: 'Ignorado' },
  OPTED_OUT: { label: 'Opt-out' },
  RESPONDED: { label: 'Respondeu' },
};

export const CAMPAIGN_RECIPIENT_STATUS_ORDER: readonly CampaignRecipientStatus[] = [
  'PENDING',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'SKIPPED',
  'OPTED_OUT',
  'RESPONDED',
];

export function campaignRecipientStatusLabel(status: CampaignRecipientStatus): string {
  return CAMPAIGN_RECIPIENT_STATUS_META[status].label;
}

export const CAMPAIGN_ROUTING_META: Readonly<
  Record<CampaignRoutingMode, { readonly label: string; readonly description: string }>
> = {
  MANUAL: {
    label: 'Manual',
    description: 'Resposta entra sem responsável. O time assume na Inbox.',
  },
  CURRENT_OWNER: {
    label: 'Responsável atual',
    description: 'A conversa vai para o responsável do lead, se houver.',
  },
  RULES: {
    label: 'Regras',
    description: 'UF, cidade, segmento ou porte escolhem o vendedor.',
  },
  ROUND_ROBIN: {
    label: 'Round-robin',
    description: 'Distribui em rodízio entre vendedores ativos.',
  },
};

export const SENT_RECIPIENT_STATUSES: readonly CampaignRecipientStatus[] = [
  'SENT',
  'DELIVERED',
  'RESPONDED',
];

/** Teto da fila de campanha. Inbox e envio avulso no lead não entram. */
export const CAMPAIGN_SENDS_PER_MINUTE = 5;

export const CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT = 2;
export const CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN = 1;
export const CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX = 72;
/** Recoloca o retorno na fila se o job delayed cair com a campanha pausada. */
export const CAMPAIGN_FOLLOW_UP_PAUSE_RETRY_MS = 60_000;

/** Primeira onda que pode entrar no retorno: enviou, ainda não respondeu. */
export const FIRST_WAVE_SENT_STATUSES: readonly CampaignRecipientStatus[] = ['SENT', 'DELIVERED'];

export const FOLLOW_UP_SENT_STATUSES: readonly CampaignRecipientStatus[] = ['SENT', 'DELIVERED'];

export const FOLLOW_UP_REQUEUE_STATUSES: readonly CampaignRecipientStatus[] = [
  'PENDING',
  'QUEUED',
  'FAILED',
];

export function campaignSendIntervalMs(): number {
  return Math.ceil(60_000 / CAMPAIGN_SENDS_PER_MINUTE);
}

export function estimateCampaignMinutes(pendingCount: number): number {
  if (!Number.isFinite(pendingCount) || pendingCount <= 0) return 0;
  return Math.ceil(pendingCount / CAMPAIGN_SENDS_PER_MINUTE);
}

export function clampFollowUpDelayHours(value: number): number {
  if (!Number.isInteger(value)) return CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT;
  return Math.min(
    CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX,
    Math.max(CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN, value),
  );
}

export function followUpDelayMs(delayHours: number): number {
  return clampFollowUpDelayHours(delayHours) * 3_600_000;
}

export function followUpDelayCutoff(delayHours: number, now = new Date()): Date {
  return new Date(now.getTime() - followUpDelayMs(delayHours));
}

export function followUpRemainingDelayMs(
  processedAt: Date | null,
  delayHours: number,
  now = new Date(),
): number {
  if (!processedAt) return followUpDelayMs(delayHours);
  const readyAt = processedAt.getTime() + followUpDelayMs(delayHours);
  return Math.max(0, readyAt - now.getTime());
}

export function isFollowUpDelayElapsed(
  processedAt: Date | null,
  delayHours: number,
  now = new Date(),
): boolean {
  if (!processedAt) return false;
  return processedAt.getTime() <= followUpDelayCutoff(delayHours, now).getTime();
}

export function canRequeueFollowUp(followUpStatus: CampaignRecipientStatus | null): boolean {
  if (followUpStatus == null) return true;
  return (FOLLOW_UP_REQUEUE_STATUSES as readonly string[]).includes(followUpStatus);
}

export function isFollowUpAlreadySent(followUpStatus: CampaignRecipientStatus | null): boolean {
  if (!followUpStatus) return false;
  return (FOLLOW_UP_SENT_STATUSES as readonly string[]).includes(followUpStatus);
}

export type FollowUpEligibilityInput = {
  readonly status: CampaignRecipientStatus;
  readonly followUpStatus: CampaignRecipientStatus | null;
  readonly processedAt: Date | null;
  readonly delayHours: number;
  readonly now?: Date;
};

export type FollowUpSkipReason =
  | 'not_sent'
  | 'responded'
  | 'opted_out'
  | 'skipped'
  | 'already_sent'
  | 'too_soon';

export function followUpSkipReason(input: FollowUpEligibilityInput): FollowUpSkipReason | null {
  if (input.status === 'RESPONDED') return 'responded';
  if (input.status === 'OPTED_OUT') return 'opted_out';
  if (input.status === 'SKIPPED') return 'skipped';
  if (!(FIRST_WAVE_SENT_STATUSES as readonly string[]).includes(input.status)) return 'not_sent';
  if (isFollowUpAlreadySent(input.followUpStatus)) return 'already_sent';
  if (input.followUpStatus === 'SKIPPED' || input.followUpStatus === 'OPTED_OUT') return 'already_sent';
  if (!isFollowUpDelayElapsed(input.processedAt, input.delayHours, input.now)) return 'too_soon';
  if (!canRequeueFollowUp(input.followUpStatus)) return 'already_sent';
  return null;
}

export function isFollowUpEligible(input: FollowUpEligibilityInput): boolean {
  return followUpSkipReason(input) == null;
}
