import type { FollowUpStatus, InteractionResult, InteractionType, LeadStatus, Role } from '@prisma/client';

export interface EnumMeta<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly order: number;
}

export const INTERACTION_TYPE_META: Readonly<Record<InteractionType, EnumMeta<InteractionType>>> = {
  WHATSAPP: { value: 'WHATSAPP', label: 'WhatsApp', order: 1 },
  PHONE: { value: 'PHONE', label: 'Telefone', order: 2 },
  EMAIL: { value: 'EMAIL', label: 'E-mail', order: 3 },
  NOTE: { value: 'NOTE', label: 'Anotação', order: 4 },
  OTHER: { value: 'OTHER', label: 'Outro', order: 5 },
};

export type ResultTone =
  | 'opened'
  | 'sent'
  | 'responded'
  | 'no-response'
  | 'callback'
  | 'no-interest'
  | 'invalid'
  | 'other';

export interface InteractionResultMeta extends EnumMeta<InteractionResult> {
  readonly tone: ResultTone;
}

export const INTERACTION_RESULT_META: Readonly<
  Record<InteractionResult, InteractionResultMeta>
> = {
  OPENED: { value: 'OPENED', label: 'Ação iniciada', tone: 'opened', order: 1 },
  SENT: { value: 'SENT', label: 'Mensagem enviada', tone: 'sent', order: 2 },
  RESPONDED: { value: 'RESPONDED', label: 'Respondeu', tone: 'responded', order: 3 },
  NO_RESPONSE: { value: 'NO_RESPONSE', label: 'Sem resposta', tone: 'no-response', order: 4 },
  CALLBACK: { value: 'CALLBACK', label: 'Pediu retorno', tone: 'callback', order: 5 },
  NO_INTEREST: { value: 'NO_INTEREST', label: 'Sem interesse', tone: 'no-interest', order: 6 },
  INVALID_NUMBER: { value: 'INVALID_NUMBER', label: 'Número inválido', tone: 'invalid', order: 7 },
  OTHER: { value: 'OTHER', label: 'Outro', tone: 'other', order: 8 },
};

export const FOLLOW_UP_STATUS_META: Readonly<Record<FollowUpStatus, EnumMeta<FollowUpStatus>>> = {
  PENDING: { value: 'PENDING', label: 'Pendente', order: 1 },
  OVERDUE: { value: 'OVERDUE', label: 'Atrasado', order: 2 },
  COMPLETED: { value: 'COMPLETED', label: 'Concluído', order: 3 },
  CANCELLED: { value: 'CANCELLED', label: 'Cancelado', order: 4 },
};

export const ROLE_META: Readonly<Record<Role, EnumMeta<Role> & { description: string }>> = {
  ADMIN: {
    value: 'ADMIN',
    label: 'Administrador',
    order: 1,
    description: 'Vê todos os leads e administra usuários, templates e importações.',
  },
  MANAGER: {
    value: 'MANAGER',
    label: 'Gestor',
    order: 2,
    description: 'Vê os leads da equipe e reatribui responsáveis.',
  },
  USER: {
    value: 'USER',
    label: 'Vendedor',
    order: 3,
    description: 'Só atualiza o Kanban e conversa na Inbox. Não vê telefone nem a base de leads.',
  },
};

function ordered<T extends string>(meta: Readonly<Record<T, EnumMeta<T>>>): readonly T[] {
  return (Object.values(meta) as EnumMeta<T>[]).sort((a, b) => a.order - b.order).map((m) => m.value);
}

export const INTERACTION_TYPE_ORDER = ordered(INTERACTION_TYPE_META);
export const INTERACTION_RESULT_ORDER = ordered(INTERACTION_RESULT_META);
export const FOLLOW_UP_STATUS_ORDER = ordered(FOLLOW_UP_STATUS_META);

/** Resultados que o vendedor registra depois de abrir o WhatsApp. */
export const OPERATIONAL_RESULTS: readonly InteractionResult[] = [
  'RESPONDED',
  'NO_RESPONSE',
  'NO_INTEREST',
  'INVALID_NUMBER',
  'CALLBACK',
];

const EARLY_FUNNEL: ReadonlySet<LeadStatus> = new Set(['NEW', 'READY_TO_CONTACT']);

/**
 * Avanço conservador do funil a partir do resultado da interação.
 * SENT / NO_RESPONSE / CALLBACK só sugerem CONTACTED se o lead ainda está
 * em Novo ou Pronto para contato. OPENED e os demais resultados não movem o funil.
 */
export function suggestedStatusFromResult(
  result: InteractionResult,
  current: LeadStatus,
): LeadStatus | null {
  switch (result) {
    case 'SENT':
    case 'NO_RESPONSE':
    case 'CALLBACK':
      return EARLY_FUNNEL.has(current) ? 'CONTACTED' : null;
    default:
      return null;
  }
}

/** Campanha e resposta na Inbox: mesmo avanço que registrar SENT. */
export function outboundSendSuggestedStatus(current: LeadStatus): LeadStatus | null {
  return suggestedStatusFromResult('SENT', current);
}

const RESULT_BADGE_CLASS: Readonly<Record<InteractionResult, string>> = {
  OPENED: 'bg-result-opened-bg text-result-opened-fg border-result-opened-border',
  SENT: 'bg-result-sent-bg text-result-sent-fg border-result-sent-border',
  RESPONDED: 'bg-result-responded-bg text-result-responded-fg border-result-responded-border',
  NO_RESPONSE:
    'bg-result-no-response-bg text-result-no-response-fg border-result-no-response-border',
  CALLBACK: 'bg-result-callback-bg text-result-callback-fg border-result-callback-border',
  NO_INTEREST:
    'bg-result-no-interest-bg text-result-no-interest-fg border-result-no-interest-border',
  INVALID_NUMBER: 'bg-result-invalid-bg text-result-invalid-fg border-result-invalid-border',
  OTHER: 'bg-result-other-bg text-result-other-fg border-result-other-border',
};

export function interactionResultBadgeClass(result: InteractionResult): string {
  return RESULT_BADGE_CLASS[result];
}

const RESULT_DOT_CLASS: Readonly<Record<InteractionResult, string>> = {
  OPENED: 'bg-result-opened-fg',
  SENT: 'bg-result-sent-fg',
  RESPONDED: 'bg-result-responded-fg',
  NO_RESPONSE: 'bg-result-no-response-fg',
  CALLBACK: 'bg-result-callback-fg',
  NO_INTEREST: 'bg-result-no-interest-fg',
  INVALID_NUMBER: 'bg-result-invalid-fg',
  OTHER: 'bg-result-other-fg',
};

export function interactionResultDotClass(result: InteractionResult): string {
  return RESULT_DOT_CLASS[result];
}

const RESULT_CSS_VAR: Readonly<Record<InteractionResult, string>> = {
  OPENED: 'var(--result-opened-fg)',
  SENT: 'var(--result-sent-fg)',
  RESPONDED: 'var(--result-responded-fg)',
  NO_RESPONSE: 'var(--result-no-response-fg)',
  CALLBACK: 'var(--result-callback-fg)',
  NO_INTEREST: 'var(--result-no-interest-fg)',
  INVALID_NUMBER: 'var(--result-invalid-fg)',
  OTHER: 'var(--result-other-fg)',
};

export function interactionResultCssVar(result: InteractionResult): string {
  return RESULT_CSS_VAR[result];
}

export function interactionResultLabel(result: InteractionResult): string {
  return INTERACTION_RESULT_META[result].label;
}
