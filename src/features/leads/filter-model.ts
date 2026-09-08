import type { LeadStatus } from '@prisma/client';

import { INTERACTION_RESULT_META } from '@/constants/interactions';
import { leadStatusLabel } from '@/constants/lead-status';
import {
  type LeadFilters,
  type LeadSortField,
  leadFiltersSchema,
} from '@/features/leads/schema';
import { filtersToSearchParams } from '@/features/leads/query';
import type { LeadFacets } from '@/server/services/lead.service';

export const LEAD_SORT_LABELS: Readonly<Record<LeadSortField, string>> = {
  razaoSocial: 'Razão social',
  createdAt: 'Cadastro',
  updatedAt: 'Atualização',
  lastContactAt: 'Último contato',
  nextContactAt: 'Próxima ação',
  status: 'Status',
  cidade: 'Cidade',
  estado: 'UF',
  capitalSocial: 'Capital social',
};

export type FilterChipKey =
  | 'search'
  | 'status'
  | 'state'
  | 'city'
  | 'segment'
  | 'source'
  | 'responsible'
  | 'tag'
  | 'porte'
  | 'situacao'
  | 'hasWhatsapp'
  | 'hasPhone'
  | 'hasEmail'
  | 'createdFrom'
  | 'createdTo'
  | 'lastContactFrom'
  | 'lastContactTo'
  | 'nextContactFrom'
  | 'nextContactTo'
  | 'lastResult'
  | 'ids'
  | 'campaignId';

export interface FilterChip {
  readonly key: FilterChipKey;
  readonly field: string;
  readonly value: string;
}

export function defaultLeadFilters(): LeadFilters {
  return leadFiltersSchema.parse({});
}

export function setFilterValue(filters: LeadFilters, patch: Partial<LeadFilters>): LeadFilters {
  return { ...filters, ...patch, page: 1 };
}

export function clearFilterValue(filters: LeadFilters, key: FilterChipKey): LeadFilters {
  if (key === 'situacao') {
    return { ...filters, situacao: 'ATIVA', page: 1 };
  }
  return { ...filters, [key]: undefined, page: 1 };
}

export function filtersToChipParams(filters: LeadFilters): URLSearchParams {
  return filtersToSearchParams(filters);
}

function formatDateChip(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function chipsFromFilters(
  filters: LeadFilters,
  facets?: LeadFacets,
): readonly FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.search) {
    chips.push({ key: 'search', field: 'Busca', value: filters.search });
  }
  if (filters.status) {
    chips.push({
      key: 'status',
      field: 'Status',
      value: leadStatusLabel(filters.status as LeadStatus),
    });
  }
  if (filters.state) {
    chips.push({ key: 'state', field: 'UF', value: filters.state });
  }
  if (filters.city) {
    chips.push({ key: 'city', field: 'Cidade', value: filters.city });
  }
  if (filters.porte) {
    chips.push({ key: 'porte', field: 'Porte', value: filters.porte });
  }
  if (filters.segment) {
    chips.push({ key: 'segment', field: 'Segmento', value: filters.segment });
  }
  if (filters.source) {
    chips.push({ key: 'source', field: 'Origem', value: filters.source });
  }
  if (filters.ids && filters.ids.length > 0) {
    chips.push({
      key: 'ids',
      field: 'Escolhidos',
      value: `${filters.ids.length} contato${filters.ids.length === 1 ? '' : 's'}`,
    });
  }
  if (filters.campaignId) {
    const name =
      facets?.campaigns?.find((campaign) => campaign.id === filters.campaignId)?.name ??
      filters.campaignId;
    chips.push({ key: 'campaignId', field: 'Campanha', value: name });
  }
  if (filters.responsible) {
    const name =
      filters.responsible === 'none'
        ? 'Sem responsável'
        : (facets?.responsaveis.find((person) => person.id === filters.responsible)?.name ??
          filters.responsible);
    chips.push({ key: 'responsible', field: 'Responsável', value: name });
  }
  if (filters.tag) {
    chips.push({ key: 'tag', field: 'Tag', value: filters.tag });
  }
  if (filters.situacao !== 'ATIVA') {
    chips.push({
      key: 'situacao',
      field: 'Situação',
      value: filters.situacao === 'all' ? 'Todas' : filters.situacao,
    });
  }
  if (filters.hasWhatsapp === true) {
    chips.push({ key: 'hasWhatsapp', field: 'WhatsApp', value: 'Com celular' });
  }
  if (filters.hasPhone === true) {
    chips.push({ key: 'hasPhone', field: 'Telefone', value: 'Com telefone' });
  }
  if (filters.hasEmail === true) {
    chips.push({ key: 'hasEmail', field: 'E-mail', value: 'Com e-mail' });
  }
  if (filters.createdFrom) {
    chips.push({ key: 'createdFrom', field: 'Cadastrado de', value: formatDateChip(filters.createdFrom) });
  }
  if (filters.createdTo) {
    chips.push({ key: 'createdTo', field: 'Cadastrado até', value: formatDateChip(filters.createdTo) });
  }
  if (filters.lastContactFrom) {
    chips.push({
      key: 'lastContactFrom',
      field: 'Último contato de',
      value: formatDateChip(filters.lastContactFrom),
    });
  }
  if (filters.lastContactTo) {
    chips.push({
      key: 'lastContactTo',
      field: 'Último contato até',
      value: formatDateChip(filters.lastContactTo),
    });
  }
  if (filters.nextContactFrom) {
    chips.push({
      key: 'nextContactFrom',
      field: 'Próximo de',
      value: formatDateChip(filters.nextContactFrom),
    });
  }
  if (filters.nextContactTo) {
    chips.push({
      key: 'nextContactTo',
      field: 'Próximo até',
      value: formatDateChip(filters.nextContactTo),
    });
  }
  if (filters.lastResult) {
    chips.push({
      key: 'lastResult',
      field: 'Última interação',
      value: INTERACTION_RESULT_META[filters.lastResult].label,
    });
  }

  return chips;
}

export interface AddableFilter {
  readonly key: FilterChipKey;
  readonly label: string;
}

const ADDABLE: readonly AddableFilter[] = [
  { key: 'status', label: 'Status' },
  { key: 'state', label: 'UF' },
  { key: 'city', label: 'Cidade' },
  { key: 'responsible', label: 'Responsável' },
  { key: 'hasWhatsapp', label: 'WhatsApp' },
  { key: 'hasPhone', label: 'Telefone' },
  { key: 'hasEmail', label: 'E-mail' },
  { key: 'lastResult', label: 'Última interação' },
  { key: 'porte', label: 'Porte' },
  { key: 'segment', label: 'Segmento' },
  { key: 'source', label: 'Origem' },
  { key: 'campaignId', label: 'Campanha' },
  { key: 'tag', label: 'Tag' },
  { key: 'createdFrom', label: 'Cadastrado' },
  { key: 'lastContactFrom', label: 'Último contato' },
  { key: 'nextContactFrom', label: 'Próxima ação' },
];

export function availableAddFilters(filters: LeadFilters): readonly AddableFilter[] {
  return ADDABLE.filter((item) => {
    if (item.key === 'hasWhatsapp') return filters.hasWhatsapp !== true;
    if (item.key === 'hasPhone') return filters.hasPhone !== true;
    if (item.key === 'hasEmail') return filters.hasEmail !== true;
    if (item.key === 'createdFrom') return !filters.createdFrom && !filters.createdTo;
    if (item.key === 'lastContactFrom') return !filters.lastContactFrom && !filters.lastContactTo;
    if (item.key === 'nextContactFrom') return !filters.nextContactFrom && !filters.nextContactTo;
    return filters[item.key] === undefined;
  });
}

/**
 * Identidade do recorte para a seleção em lote. Página e tamanho da página
 * não entram: paginar no modo filtro não pode zerar a seleção.
 */
export function leadFilterSelectionKey(filters: LeadFilters): string {
  const { page: _page, limit: _limit, ...rest } = filters;
  return JSON.stringify(rest);
}
