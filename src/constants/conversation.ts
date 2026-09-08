import type { ConversationStatus, MessageDirection } from '@prisma/client';

export interface ConversationStatusMeta {
  readonly value: ConversationStatus;
  readonly label: string;
  readonly tone: 'open' | 'waiting' | 'resolved';
  readonly description: string;
}

export const CONVERSATION_STATUS_META: Readonly<Record<ConversationStatus, ConversationStatusMeta>> =
  {
    OPEN: {
      value: 'OPEN',
      label: 'Em atendimento',
      tone: 'open',
      description: 'Há responsável e a conversa ainda não foi resolvida.',
    },
    WAITING: {
      value: 'WAITING',
      label: 'Aguardando',
      tone: 'waiting',
      description: 'Sem responsável ou aguardando a próxima ação.',
    },
    RESOLVED: {
      value: 'RESOLVED',
      label: 'Resolvida',
      tone: 'resolved',
      description: 'Atendimento encerrado. O funil do lead não muda só por isso.',
    },
  };

export function conversationStatusLabel(status: ConversationStatus): string {
  return CONVERSATION_STATUS_META[status].label;
}

const CONVERSATION_BADGE_CLASS: Readonly<Record<ConversationStatus, string>> = {
  OPEN: 'bg-conversation-open-bg text-conversation-open-fg border-conversation-open-border',
  WAITING:
    'bg-conversation-waiting-bg text-conversation-waiting-fg border-conversation-waiting-border',
  RESOLVED:
    'bg-conversation-resolved-bg text-conversation-resolved-fg border-conversation-resolved-border',
};

const CONVERSATION_DOT_CLASS: Readonly<Record<ConversationStatus, string>> = {
  OPEN: 'bg-conversation-open-fg',
  WAITING: 'bg-conversation-waiting-fg',
  RESOLVED: 'bg-conversation-resolved-fg',
};

export function conversationStatusBadgeClass(status: ConversationStatus): string {
  return CONVERSATION_BADGE_CLASS[status];
}

export function conversationStatusDotClass(status: ConversationStatus): string {
  return CONVERSATION_DOT_CLASS[status];
}

export function messageDirectionLabel(direction: MessageDirection): string {
  return direction === 'INBOUND' ? 'Recebida' : 'Enviada';
}

export function messageDeliveryLabel(status: string): string {
  if (status === 'PENDING') return 'Pendente';
  if (status === 'SENT') return 'Enviada';
  if (status === 'DELIVERED') return 'Entregue';
  if (status === 'READ') return 'Lida';
  return 'Falhou';
}

/**
 * Kanban do vendedor filtra por `Lead.responsavelId`. Quem recebe a conversa
 * (transferir / assumir / atribuir / roteamento) passa a ser o responsável
 * do lead ligado, senão o card não entra no quadro dele.
 */
export function shouldAssignLeadOwner(params: {
  readonly leadId: string | null | undefined;
  readonly currentResponsavelId: string | null | undefined;
  readonly toUserId: string;
}): boolean {
  if (!params.leadId) return false;
  return params.currentResponsavelId !== params.toUserId;
}

export function shouldNotifyConversationRead(unreadCount: number): boolean {
  return unreadCount > 0;
}

export function inboxAttachLeadOwnerId(
  assignedUserId: string | null | undefined,
  actorUserId: string,
): string {
  return assignedUserId || actorUserId;
}

export type TransferSliceMessage = {
  readonly campaignId: string | null;
  readonly direction: string;
  readonly kind: string;
};

/** Disparo de campanha (template/mídia). Resposta manual TEXT não abre onda nova. */
export function isCampaignWaveMessage(row: TransferSliceMessage): boolean {
  return row.direction === 'OUTBOUND' && Boolean(row.campaignId) && row.kind !== 'TEXT';
}

/**
 * Índice da primeira mensagem da campanha mais recente.
 * 0 = não fatia (uma onda ou só conversa orgânica).
 */
export function transferSliceStartIndex(messages: readonly TransferSliceMessage[]): number {
  const firstIndexByCampaign = new Map<string, number>();
  let latestCampaignId: string | null = null;
  for (let index = 0; index < messages.length; index += 1) {
    const row = messages[index]!;
    if (!isCampaignWaveMessage(row) || !row.campaignId) continue;
    if (!firstIndexByCampaign.has(row.campaignId)) {
      firstIndexByCampaign.set(row.campaignId, index);
    }
    latestCampaignId = row.campaignId;
  }
  if (!latestCampaignId || firstIndexByCampaign.size <= 1) return 0;
  return firstIndexByCampaign.get(latestCampaignId) ?? 0;
}

export const INBOX_FILTERS = [
  'all',
  'unread',
  'mine',
  'unassigned',
  'open',
  'waiting',
  'resolved',
] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const INBOX_FILTER_LABELS: Readonly<Record<InboxFilter, string>> = {
  all: 'Todas',
  unread: 'Não lidas',
  mine: 'Minhas',
  unassigned: 'Sem responsável',
  open: 'Em atendimento',
  waiting: 'Aguardando',
  resolved: 'Resolvidas',
};
