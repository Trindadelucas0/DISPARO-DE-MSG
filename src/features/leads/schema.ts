import { InteractionResult, LeadStatus } from '@prisma/client';
import { z } from 'zod';

import { normalizeCnpj } from '@/lib/validation/cnpj';

/**
 * Contrato de entrada da API de leads (PRD §42).
 * Todo filtro chega por querystring e é resolvido no banco. Buscar tudo e
 * filtrar em JavaScript é proibido (regra ux-ui-crm §9).
 */

export const LEAD_SORT_FIELDS = [
  'razaoSocial',
  'createdAt',
  'updatedAt',
  'lastContactAt',
  'nextContactAt',
  'status',
  'cidade',
  'estado',
  'capitalSocial',
] as const;

export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export const SITUACAO_CADASTRAL_VALUES = [
  'ATIVA',
  'BAIXADA',
  'INAPTA',
  'SUSPENSA',
  'NULA',
] as const;

/** `''` vira `undefined`: o formulário manda string vazia quando o campo está limpo. */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

const booleanFlag = z.preprocess((value) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}, z.boolean().optional());

const isoDate = emptyToUndefined(
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.'),
);

/** Teto igual ao lote da listagem: ids vão na querystring e no JSON da campanha. */
export const MAX_FILTER_LEAD_IDS = 500;

/** Origem gravada em `createManualLead` quando não há CNPJ da Receita. */
export const MANUAL_LEAD_SOURCE = 'MANUAL';

/** Aceita `ids=a,b` na querystring ou `ids: string[]` no JSON da campanha. */
export function parseLeadIds(value: unknown): string[] | undefined {
  if (value == null || value === '') return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const id = String(part).trim();
    if (!id || id.length > 40) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_FILTER_LEAD_IDS) break;
  }
  return ids.length > 0 ? ids : undefined;
}

export function mergeLeadIds(
  current: readonly string[] | undefined,
  add: readonly string[],
): string[] | undefined {
  return parseLeadIds([...(current ?? []), ...add]);
}

export const leadFiltersSchema = z.object({
  search: emptyToUndefined(z.string().trim().max(120)),
  status: emptyToUndefined(z.nativeEnum(LeadStatus)),
  state: emptyToUndefined(z.string().trim().length(2).toUpperCase()),
  city: emptyToUndefined(z.string().trim().max(120)),
  segment: emptyToUndefined(z.string().trim().max(200)),
  source: emptyToUndefined(z.string().trim().max(120)),
  responsible: emptyToUndefined(z.string().trim().max(40)),
  tag: emptyToUndefined(z.string().trim().max(60)),
  porte: emptyToUndefined(z.string().trim().max(60)),
  /** Destinatários escolhidos (campanha). Sem este campo o público continua sendo o filtro. */
  ids: z.preprocess(parseLeadIds, z.array(z.string().min(1).max(40)).max(MAX_FILTER_LEAD_IDS).optional()),
  /** Leads que já são destinatários desta campanha. */
  campaignId: emptyToUndefined(z.string().trim().min(1).max(40)),

  /**
   * Filtro padrão da listagem: apenas ATIVA. `all` traz todas as situações.
   * O contador da tela informa quantas ficaram de fora — nada é escondido em silêncio.
   */
  situacao: z
    .preprocess(
      (value) => (value === '' || value === null || value === undefined ? 'ATIVA' : value),
      z.union([z.enum(SITUACAO_CADASTRAL_VALUES), z.literal('all')]),
    )
    .default('ATIVA'),

  hasWhatsapp: booleanFlag,
  hasPhone: booleanFlag,
  hasEmail: booleanFlag,

  createdFrom: isoDate,
  createdTo: isoDate,
  lastContactFrom: isoDate,
  lastContactTo: isoDate,
  nextContactFrom: isoDate,
  nextContactTo: isoDate,
  lastResult: emptyToUndefined(z.nativeEnum(InteractionResult)),

  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(200).default(50),
  sort: z.enum(LEAD_SORT_FIELDS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export function parseLeadFilters(searchParams: URLSearchParams | Record<string, string | undefined>) {
  const raw =
    searchParams instanceof URLSearchParams
      ? Object.fromEntries(searchParams.entries())
      : searchParams;
  return leadFiltersSchema.safeParse(raw);
}

/** Filtros ativos além dos padrões — usado pelo rótulo "N filtros aplicados". */
export function countActiveFilters(filters: LeadFilters): number {
  const keys: (keyof LeadFilters)[] = [
    'search',
    'status',
    'state',
    'city',
    'segment',
    'source',
    'responsible',
    'tag',
    'porte',
    'ids',
    'campaignId',
    'hasWhatsapp',
    'hasPhone',
    'hasEmail',
    'createdFrom',
    'createdTo',
    'lastContactFrom',
    'lastContactTo',
    'nextContactFrom',
    'nextContactTo',
    'lastResult',
  ];
  let count = keys.reduce((total, key) => (filters[key] === undefined ? total : total + 1), 0);
  if (filters.situacao !== 'ATIVA') count += 1;
  return count;
}

// --- Escrita ---------------------------------------------------------------

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

export const leadUpdateSchema = z
  .object({
    razaoSocial: z.string().trim().min(2, 'Razão social é obrigatória.').max(255).optional(),
    nomeFantasia: optionalText(255),
    telefone: optionalText(32),
    whatsapp: optionalText(32),
    email: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().toLowerCase().email('E-mail inválido.').max(180).nullable().optional(),
    ),
    estado: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().length(2, 'UF tem 2 letras.').toUpperCase().nullable().optional(),
    ),
    cidade: optionalText(120),
    logradouro: optionalText(255),
    numero: optionalText(32),
    complemento: optionalText(120),
    bairro: optionalText(120),
    cep: optionalText(16),
    segmento: optionalText(255),
    porte: optionalText(60),
    origem: optionalText(120),
    observacoes: optionalText(4000),
    status: z.nativeEnum(LeadStatus).optional(),
    responsavelId: z.string().trim().min(1).nullable().optional(),
    nextContactAt: z.preprocess(
      (value) => (value === '' || value === null ? null : value),
      z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.')
        .nullable()
        .optional(),
    ),
  })
  .strict();

export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

/** Contato manual (Inbox ou Leads). CNPJ da Receita é opcional. */
export const manualLeadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().max(32).optional(),
  cnpj: z.string().trim().max(18).optional(),
});

export type ManualLeadInput = z.infer<typeof manualLeadSchema>;

export const cnpjSchema = z
  .string()
  .transform((value) => normalizeCnpj(value))
  .refine((value): value is string => value !== null, 'CNPJ deve ter 14 dígitos.');
