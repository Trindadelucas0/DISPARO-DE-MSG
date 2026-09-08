import type { LeadStatus } from '@prisma/client';

/**
 * Funil comercial (7 valores). Resultado da última interação é outro conceito
 * e vive em `src/constants/interactions.ts`.
 */

export type StatusTone =
  | 'new'
  | 'ready'
  | 'contacted'
  | 'qualified'
  | 'negotiation'
  | 'customer'
  | 'lost';

export interface LeadStatusMeta {
  readonly value: LeadStatus;
  readonly label: string;
  readonly shortLabel: string;
  readonly tone: StatusTone;
  /** Ordem no funil e nas colunas do Kanban. */
  readonly order: number;
  /** Estado terminal não gera próximo contato automático. */
  readonly terminal: boolean;
  readonly description: string;
}

export const LEAD_STATUS_META: Readonly<Record<LeadStatus, LeadStatusMeta>> = {
  NEW: {
    value: 'NEW',
    label: 'Novo',
    shortLabel: 'Novo',
    tone: 'new',
    order: 1,
    terminal: false,
    description: 'Importado e ainda não triado.',
  },
  READY_TO_CONTACT: {
    value: 'READY_TO_CONTACT',
    label: 'Pronto para contato',
    shortLabel: 'Pronto',
    tone: 'ready',
    order: 2,
    terminal: false,
    description: 'Triado, com canal de contato válido.',
  },
  CONTACTED: {
    value: 'CONTACTED',
    label: 'Contatado',
    shortLabel: 'Contatado',
    tone: 'contacted',
    order: 3,
    terminal: false,
    description: 'Mensagem ou ligação enviada, aguardando retorno.',
  },
  QUALIFIED: {
    value: 'QUALIFIED',
    label: 'Qualificado',
    shortLabel: 'Qualificado',
    tone: 'qualified',
    order: 4,
    terminal: false,
    description: 'Tem perfil e interesse confirmados.',
  },
  NEGOTIATION: {
    value: 'NEGOTIATION',
    label: 'Negociação',
    shortLabel: 'Negociação',
    tone: 'negotiation',
    order: 5,
    terminal: false,
    description: 'Proposta em discussão.',
  },
  CUSTOMER: {
    value: 'CUSTOMER',
    label: 'Cliente',
    shortLabel: 'Cliente',
    tone: 'customer',
    order: 6,
    terminal: true,
    description: 'Fechou. Estado terminal de ganho.',
  },
  LOST: {
    value: 'LOST',
    label: 'Perdido',
    shortLabel: 'Perdido',
    tone: 'lost',
    order: 7,
    terminal: true,
    description: 'Negociação encerrada sem fechamento.',
  },
};

export const LEAD_STATUS_ORDER: readonly LeadStatus[] = Object.values(LEAD_STATUS_META)
  .slice()
  .sort((a, b) => a.order - b.order)
  .map((meta) => meta.value);

export const LEAD_STATUS_VALUES = LEAD_STATUS_ORDER;

/** Novo e Pronto não entram no Kanban (admin nem vendedor). Base crua fica em Leads. */
const KANBAN_PRE_CONTACT = new Set<LeadStatus>(['NEW', 'READY_TO_CONTACT']);

export function isKanbanVisibleStatus(status: LeadStatus): boolean {
  return !KANBAN_PRE_CONTACT.has(status);
}

export const KANBAN_STATUS_ORDER: readonly LeadStatus[] =
  LEAD_STATUS_ORDER.filter(isKanbanVisibleStatus);

export function leadStatusMeta(status: LeadStatus): LeadStatusMeta {
  return LEAD_STATUS_META[status];
}

export function leadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUS_META[status].label;
}

/**
 * Classes Tailwind do badge, escritas literalmente porque o Tailwind não detecta
 * classe montada por interpolação. `CUSTOMER` é o único preenchido (ver DESIGN.md).
 */
const STATUS_BADGE_CLASS: Readonly<Record<LeadStatus, string>> = {
  NEW: 'bg-status-new-bg text-status-new-fg border-status-new-border',
  READY_TO_CONTACT: 'bg-status-ready-bg text-status-ready-fg border-status-ready-border',
  CONTACTED: 'bg-status-contacted-bg text-status-contacted-fg border-status-contacted-border',
  QUALIFIED: 'bg-status-qualified-bg text-status-qualified-fg border-status-qualified-border',
  NEGOTIATION:
    'bg-status-negotiation-bg text-status-negotiation-fg border-status-negotiation-border',
  CUSTOMER: 'bg-status-customer-bg text-status-customer-fg border-status-customer-border',
  LOST: 'bg-status-lost-bg text-status-lost-fg border-status-lost-border',
};

export function leadStatusBadgeClass(status: LeadStatus): string {
  return STATUS_BADGE_CLASS[status];
}

/** Ponto de cor usado na coluna do Kanban e na legenda de gráfico. */
const STATUS_DOT_CLASS: Readonly<Record<LeadStatus, string>> = {
  NEW: 'bg-status-new-fg',
  READY_TO_CONTACT: 'bg-status-ready-fg',
  CONTACTED: 'bg-status-contacted-fg',
  QUALIFIED: 'bg-status-qualified-fg',
  NEGOTIATION: 'bg-status-negotiation-fg',
  CUSTOMER: 'bg-status-customer-bg',
  LOST: 'bg-status-lost-fg',
};

export function leadStatusDotClass(status: LeadStatus): string {
  return STATUS_DOT_CLASS[status];
}

/** Token CSS do ponto/barra de gráfico. Recharts lê a variável, não hex cru. */
const STATUS_CSS_VAR: Readonly<Record<LeadStatus, string>> = {
  NEW: 'var(--status-new-fg)',
  READY_TO_CONTACT: 'var(--status-ready-fg)',
  CONTACTED: 'var(--status-contacted-fg)',
  QUALIFIED: 'var(--status-qualified-fg)',
  NEGOTIATION: 'var(--status-negotiation-fg)',
  CUSTOMER: 'var(--status-customer-bg)',
  LOST: 'var(--status-lost-fg)',
};

export function leadStatusCssVar(status: LeadStatus): string {
  return STATUS_CSS_VAR[status];
}
