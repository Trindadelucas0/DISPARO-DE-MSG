import type { LeadSortField } from '@/features/leads/schema';

/**
 * Geometria e ordenação das colunas da tabela de leads.
 *
 * Fica em módulo neutro (sem `'use client'`) de propósito: a página é Server
 * Component e usa as larguras no skeleton. Constante exportada de um módulo
 * cliente chega no servidor como referência opaca, não como array — e quebra
 * na serialização.
 */

export interface LeadColumn {
  readonly key: string;
  readonly label: string;
  readonly sort?: LeadSortField;
  readonly align?: 'left' | 'right' | 'center';
  readonly className?: string;
  /** Largura usada pelo skeleton para ter a mesma silhueta da tabela real. */
  readonly skeletonWidth: string;
}

/** Coluna de seleção: não tem rótulo nem ordenação, mas ocupa espaço. */
export const SELECT_COLUMN_WIDTH = '1rem';

export const LEAD_COLUMNS: readonly LeadColumn[] = [
  { key: 'empresa', label: 'Empresa', sort: 'razaoSocial', skeletonWidth: '22%' },
  { key: 'cnpj', label: 'CNPJ', className: 'w-36', skeletonWidth: '8rem' },
  { key: 'telefone', label: 'Telefone', className: 'w-32', skeletonWidth: '6.5rem' },
  { key: 'whatsapp', label: 'WhatsApp', className: 'w-32', skeletonWidth: '6.5rem' },
  { key: 'local', label: 'Cidade / UF', sort: 'cidade', className: 'w-36', skeletonWidth: '7rem' },
  { key: 'status', label: 'Status', sort: 'status', className: 'w-32', skeletonWidth: '6rem' },
  { key: 'responsavel', label: 'Responsável', className: 'w-28', skeletonWidth: '5.5rem' },
  { key: 'proximo', label: 'Próxima ação', sort: 'nextContactAt', className: 'w-28', skeletonWidth: '5rem' },
  { key: 'result', label: 'Última interação', className: 'w-40', skeletonWidth: '7rem' },
  { key: 'acoes', label: 'Ações', className: 'w-12', skeletonWidth: '2.5rem' },
];

export const LEAD_COLUMN_WIDTHS: readonly string[] = [
  SELECT_COLUMN_WIDTH,
  ...LEAD_COLUMNS.map((column) => column.skeletonWidth),
];
