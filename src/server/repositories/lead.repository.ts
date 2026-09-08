import type { LeadStatus, Prisma } from '@prisma/client';

import type { LeadFilters } from '@/features/leads/schema';
import { prisma } from '@/lib/db';
import { onlyDigits } from '@/lib/validation/cnpj';
import {
  attachLastInteraction,
  withLastResultFilter,
  type LastInteractionFields,
} from '@/server/repositories/interaction.repository';

/**
 * Acesso a dados de leads. Nenhuma regra de autorização aqui: o recorte por
 * papel chega pronto em `scope` (ver src/lib/auth/rbac.ts).
 */

/** `select` explícito: a tabela não precisa de rawImport nem de sócios. */
export const LEAD_LIST_SELECT = {
  id: true,
  cnpj: true,
  razaoSocial: true,
  nomeFantasia: true,
  telefone: true,
  whatsapp: true,
  email: true,
  estado: true,
  cidade: true,
  porte: true,
  segmento: true,
  situacaoCadastral: true,
  status: true,
  score: true,
  responsavelId: true,
  lastContactAt: true,
  nextContactAt: true,
  createdAt: true,
  responsavel: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.LeadSelect;

export type LeadListRow = Prisma.LeadGetPayload<{ select: typeof LEAD_LIST_SELECT }> &
  LastInteractionFields;

export const LEAD_DETAIL_SELECT = {
  ...LEAD_LIST_SELECT,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cep: true,
  ibge: true,
  origem: true,
  observacoes: true,
  phones: true,
  cnaePrincipalCodigo: true,
  cnaePrincipalDescricao: true,
  cnaeSecundarios: true,
  naturezaJuridica: true,
  dataAbertura: true,
  capitalSocial: true,
  socios: true,
  optanteSimples: true,
  optanteMei: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

export type LeadDetailRow = Prisma.LeadGetPayload<{ select: typeof LEAD_DETAIL_SELECT }> &
  LastInteractionFields;

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(from);
  if (to) {
    // `to` chega como data (sem hora): inclui o dia inteiro.
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return filter;
}

export function buildLeadWhere(
  filters: LeadFilters,
  scope: Prisma.LeadWhereInput,
): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [scope];

  if (filters.search) {
    const term = filters.search.trim();
    const digits = onlyDigits(term);
    const or: Prisma.LeadWhereInput[] = [
      { razaoSocial: { contains: term, mode: 'insensitive' } },
      { nomeFantasia: { contains: term, mode: 'insensitive' } },
    ];
    // Só busca por CNPJ/telefone quando o termo tem dígitos suficientes para valer a pena.
    if (digits.length >= 3) {
      or.push({ cnpj: { contains: digits } });
      or.push({ whatsapp: { contains: digits } });
      or.push({ telefone: { contains: digits } });
    }
    and.push({ OR: or });
  }

  if (filters.ids && filters.ids.length > 0) {
    and.push({ id: { in: [...filters.ids] } });
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.state) and.push({ estado: filters.state });
  if (filters.city) and.push({ cidade: { equals: filters.city, mode: 'insensitive' } });
  if (filters.segment) and.push({ segmento: { equals: filters.segment, mode: 'insensitive' } });
  if (filters.source) and.push({ origem: { equals: filters.source, mode: 'insensitive' } });
  if (filters.porte) and.push({ porte: { equals: filters.porte, mode: 'insensitive' } });

  if (filters.responsible === 'none') {
    and.push({ responsavelId: null });
  } else if (filters.responsible) {
    and.push({ responsavelId: filters.responsible });
  }

  if (filters.tag) and.push({ tags: { some: { tag: { name: filters.tag } } } });
  if (filters.campaignId) {
    and.push({ campaignRecipients: { some: { campaignId: filters.campaignId } } });
  }

  if (filters.situacao !== 'all') and.push({ situacaoCadastral: filters.situacao });

  if (filters.hasWhatsapp !== undefined) {
    and.push(filters.hasWhatsapp ? { NOT: { whatsapp: null } } : { whatsapp: null });
  }
  if (filters.hasPhone !== undefined) {
    and.push(filters.hasPhone ? { NOT: { telefone: null } } : { telefone: null });
  }
  if (filters.hasEmail !== undefined) {
    and.push(filters.hasEmail ? { NOT: { email: null } } : { email: null });
  }

  const created = dateRange(filters.createdFrom, filters.createdTo);
  if (created) and.push({ createdAt: created });

  const lastContact = dateRange(filters.lastContactFrom, filters.lastContactTo);
  if (lastContact) and.push({ lastContactAt: lastContact });

  const nextContact = dateRange(filters.nextContactFrom, filters.nextContactTo);
  if (nextContact) and.push({ nextContactAt: nextContact });

  return and.length === 1 ? (and[0] as Prisma.LeadWhereInput) : { AND: and };
}

function buildOrderBy(filters: LeadFilters): Prisma.LeadOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = filters.dir;
  const primary = { [filters.sort]: direction } as Prisma.LeadOrderByWithRelationInput;
  // Desempate por id mantém a paginação por offset estável entre páginas.
  return [primary, { id: 'asc' }];
}

export interface LeadPage {
  readonly rows: LeadListRow[];
  readonly total: number;
}

export async function findLeadPage(
  filters: LeadFilters,
  scope: Prisma.LeadWhereInput,
): Promise<LeadPage> {
  const where = await withLastResultFilter(buildLeadWhere(filters, scope), filters.lastResult);

  const [rows, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select: LEAD_LIST_SELECT,
      orderBy: buildOrderBy(filters),
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return { rows: await attachLastInteraction(rows), total };
}

/**
 * IDs do recorte atual, na mesma ordem da listagem, com teto. `matched` é o
 * total sem o teto — a UI avisa quando a operação não alcança o filtro inteiro.
 */
export async function findLeadIdsMatching(
  filters: LeadFilters,
  scope: Prisma.LeadWhereInput,
  take: number,
): Promise<{ ids: string[]; matched: number }> {
  const where = await withLastResultFilter(buildLeadWhere(filters, scope), filters.lastResult);
  const [rows, matched] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select: { id: true },
      orderBy: buildOrderBy(filters),
      take,
    }),
    prisma.lead.count({ where }),
  ]);
  return { ids: rows.map((row) => row.id), matched };
}

export async function countLeads(where: Prisma.LeadWhereInput): Promise<number> {
  return prisma.lead.count({ where });
}

export async function findLeadById(
  id: string,
  scope: Prisma.LeadWhereInput,
): Promise<LeadDetailRow | null> {
  const row = await prisma.lead.findFirst({
    where: { AND: [{ id }, scope] },
    select: LEAD_DETAIL_SELECT,
  });
  if (!row) return null;
  const [withResult] = await attachLastInteraction([row]);
  return withResult ?? null;
}

export async function updateLead(
  id: string,
  data: Prisma.LeadUpdateInput,
): Promise<LeadDetailRow> {
  const row = await prisma.lead.update({ where: { id }, data, select: LEAD_DETAIL_SELECT });
  const [withResult] = await attachLastInteraction([row]);
  return withResult!;
}

/**
 * Escrita em lote. O `scope` entra no `where` para que a operação não alcance
 * lead fora do recorte do papel, mesmo que o id venha na requisição.
 *
 * Usa `Unchecked` porque a variante checada não expõe `responsavelId`, e em
 * lote a reatribuição é feita pela FK, não por `connect`.
 */
export async function updateManyLeads(
  ids: readonly string[],
  scope: Prisma.LeadWhereInput,
  data: Prisma.LeadUncheckedUpdateManyInput,
): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: { AND: [{ id: { in: [...ids] } }, scope] },
    data,
  });
  return result.count;
}

export interface FacetOption {
  readonly value: string;
  readonly count: number;
}

/**
 * Contagem de leads por coluna de texto, já no formato que a UI consome.
 *
 * O resultado é normalizado aqui de propósito: o tipo genérico do `groupBy` do
 * Prisma não deve vazar para o service nem para a interface.
 */
/**
 * O `by` do groupBy precisa ser literal: com uma variável, o Prisma perde a
 * validação de tipo e devolve um tipo de erro. Por isso cada faceta tem sua
 * própria chamada, e a normalização é feita por um único helper.
 */
function shapeFacet<T extends { _count: { _all: number } }>(
  rows: readonly T[],
  pick: (row: T) => string | null,
): FacetOption[] {
  const options: FacetOption[] = [];
  for (const row of rows) {
    const value = pick(row);
    // Coluna nula não vira opção de filtro: não há o que selecionar.
    if (value) options.push({ value, count: row._count._all });
  }
  return options;
}

/** Valores distintos para os seletores de filtro. Vem do banco, não do cliente. */
export async function findLeadFacets(scope: Prisma.LeadWhereInput) {
  const [states, cities, segments, sources, portes, responsaveis, tags, campaigns] = await Promise.all([
    prisma.lead
      .groupBy({ by: ['estado'], where: scope, _count: { _all: true }, orderBy: { estado: 'asc' } })
      .then((rows) => shapeFacet(rows, (row) => row.estado)),
    prisma.lead
      .groupBy({ by: ['cidade'], where: scope, _count: { _all: true }, orderBy: { cidade: 'asc' } })
      .then((rows) => shapeFacet(rows, (row) => row.cidade)),
    prisma.lead
      .groupBy({
        by: ['segmento'],
        where: scope,
        _count: { _all: true },
        orderBy: { segmento: 'asc' },
      })
      .then((rows) => shapeFacet(rows, (row) => row.segmento)),
    prisma.lead
      .groupBy({ by: ['origem'], where: scope, _count: { _all: true }, orderBy: { origem: 'asc' } })
      .then((rows) => shapeFacet(rows, (row) => row.origem)),
    prisma.lead
      .groupBy({ by: ['porte'], where: scope, _count: { _all: true }, orderBy: { porte: 'asc' } })
      .then((rows) => shapeFacet(rows, (row) => row.porte)),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.tag.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
    prisma.campaign.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  return { states, cities, segments, sources, portes, responsaveis, tags, campaigns };
}

export async function countLeadsBySituacao(scope: Prisma.LeadWhereInput): Promise<FacetOption[]> {
  const rows = await prisma.lead.groupBy({
    by: ['situacaoCadastral'],
    where: scope,
    _count: { _all: true },
    orderBy: { situacaoCadastral: 'asc' },
  });
  return shapeFacet(rows, (row) => row.situacaoCadastral);
}

export const KANBAN_CARD_SELECT = {
  id: true,
  razaoSocial: true,
  nomeFantasia: true,
  cidade: true,
  estado: true,
  whatsapp: true,
  telefone: true,
  email: true,
  status: true,
  nextContactAt: true,
  lastContactAt: true,
  responsavelId: true,
  responsavel: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

export type KanbanCardRow = Prisma.LeadGetPayload<{ select: typeof KANBAN_CARD_SELECT }> &
  LastInteractionFields;

export async function findKanbanColumn(
  status: LeadStatus,
  scope: Prisma.LeadWhereInput,
  offset: number,
  limit: number,
): Promise<{ rows: KanbanCardRow[]; nextOffset: number | null; total: number }> {
  const where: Prisma.LeadWhereInput = { AND: [scope, { status }] };

  const [rows, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select: KANBAN_CARD_SELECT,
      orderBy: [{ nextContactAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  const nextOffset = offset + rows.length < total ? offset + rows.length : null;

  return { rows: await attachLastInteraction(rows), nextOffset, total };
}

export const EXPORT_SELECT = {
  ...LEAD_LIST_SELECT,
  logradouro: true,
  numero: true,
  bairro: true,
  cep: true,
  origem: true,
  observacoes: true,
} satisfies Prisma.LeadSelect;

export type ExportLeadRow = Prisma.LeadGetPayload<{ select: typeof EXPORT_SELECT }>;

/** Leitura por cursor para exportação. Offset em 3.306 linhas já é ok; cursor evita drift. */
export async function findLeadsForExport(
  where: Prisma.LeadWhereInput,
  cursor: string | undefined,
  take: number,
): Promise<ExportLeadRow[]> {
  return prisma.lead.findMany({
    where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
    select: EXPORT_SELECT,
    orderBy: { id: 'asc' },
    take,
  });
}

export async function addTagsToLeads(
  ids: readonly string[],
  tagId: string,
  scope: Prisma.LeadWhereInput,
): Promise<number> {
  const reachable = await prisma.lead.findMany({
    where: { AND: [{ id: { in: [...ids] } }, scope] },
    select: { id: true },
  });
  if (reachable.length === 0) return 0;

  const result = await prisma.leadTag.createMany({
    data: reachable.map((lead) => ({ leadId: lead.id, tagId })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function removeTagsFromLeads(
  ids: readonly string[],
  tagId: string,
  scope: Prisma.LeadWhereInput,
): Promise<number> {
  const reachable = await prisma.lead.findMany({
    where: { AND: [{ id: { in: [...ids] } }, scope] },
    select: { id: true },
  });
  if (reachable.length === 0) return 0;

  const result = await prisma.leadTag.deleteMany({
    where: { tagId, leadId: { in: reachable.map((lead) => lead.id) } },
  });
  return result.count;
}

export async function findTagById(id: string): Promise<{ id: string; name: string } | null> {
  return prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } });
}

export async function findLeadByCnpj(cnpj: string) {
  return prisma.lead.findUnique({
    where: { cnpj },
    select: { id: true, cnpj: true, razaoSocial: true, whatsapp: true, telefone: true, responsavelId: true },
  });
}

export async function findLeadByWhatsappDigits(digits: string) {
  const last11 = digits.slice(-11);
  const last10 = digits.slice(-10);
  const keys = [...new Set([last11, last10].filter((value) => value.length >= 10))];
  return prisma.lead.findFirst({
    where: {
      OR: [
        { whatsapp: { contains: last11 } },
        { whatsapp: { contains: last10 } },
        { telefone: { contains: last11 } },
        { telefone: { contains: last10 } },
        { phones: { hasSome: keys } },
      ],
    },
    select: { id: true, cnpj: true, razaoSocial: true, whatsapp: true, telefone: true, responsavelId: true },
  });
}

export async function findLeadsByPhoneKeys(keys: readonly string[]) {
  const unique = [...new Set(keys)].filter((value) => value.length >= 10);
  if (unique.length === 0) return [];

  const rows: Array<{
    id: string;
    whatsapp: string | null;
    telefone: string | null;
    phones: string[];
  }> = [];
  const seen = new Set<string>();
  const chunkSize = 400;
  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    const found = await prisma.lead.findMany({
      where: {
        OR: [
          { whatsapp: { in: chunk } },
          { telefone: { in: chunk } },
          { phones: { hasSome: chunk } },
        ],
      },
      select: { id: true, whatsapp: true, telefone: true, phones: true },
    });
    for (const row of found) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

export async function createManyLeads(
  rows: readonly {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string | null;
    whatsapp?: string | null;
    telefone?: string | null;
    phones?: string[];
    origem: string;
    status?: LeadStatus;
    situacaoCadastral?: string | null;
  }[],
): Promise<number> {
  let inserted = 0;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const result = await prisma.lead.createMany({
      data: chunk.map((row) => ({
        cnpj: row.cnpj,
        razaoSocial: row.razaoSocial,
        nomeFantasia: row.nomeFantasia ?? null,
        whatsapp: row.whatsapp ?? null,
        telefone: row.telefone ?? null,
        phones: row.phones ?? [],
        origem: row.origem,
        status: row.status ?? 'NEW',
        situacaoCadastral: row.situacaoCadastral ?? null,
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }
  return inserted;
}

export async function fillLeadWhatsappIfEmpty(id: string, whatsapp: string): Promise<void> {
  await prisma.lead.updateMany({
    where: { id, OR: [{ whatsapp: null }, { whatsapp: '' }] },
    data: { whatsapp },
  });
}

/** Promise pronto para `$transaction`: o dono da conversa vira responsável do lead. */
export function connectLeadOwner(leadId: string, userId: string) {
  return prisma.lead.update({
    where: { id: leadId },
    data: { responsavel: { connect: { id: userId } } },
    select: { id: true },
  });
}

export async function createLead(data: {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  whatsapp?: string | null;
  telefone?: string | null;
  phones?: string[];
  origem: string;
  status?: LeadStatus;
  responsavelId?: string | null;
  situacaoCadastral?: string | null;
}) {
  return prisma.lead.create({
    data: {
      cnpj: data.cnpj,
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia ?? null,
      whatsapp: data.whatsapp ?? null,
      telefone: data.telefone ?? null,
      phones: data.phones ?? [],
      origem: data.origem,
      status: data.status ?? 'NEW',
      responsavelId: data.responsavelId ?? null,
      situacaoCadastral: data.situacaoCadastral ?? null,
    },
    select: { id: true, cnpj: true, razaoSocial: true, whatsapp: true, telefone: true, responsavelId: true },
  });
}
