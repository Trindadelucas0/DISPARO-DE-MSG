import { Prisma, type InteractionResult, type LeadStatus } from '@prisma/client';

import { BULK_LIMIT, type BulkLeadInput, type BulkLeadResult } from '@/features/leads/bulk-schema';
import type { LeadFilters, LeadUpdateInput, ManualLeadInput } from '@/features/leads/schema';
import { MANUAL_LEAD_SOURCE, manualLeadSchema } from '@/features/leads/schema';
import { CACHE_TAGS, CACHE_TTL, cacheKey, filterHash, getOrSet } from '@/lib/cache';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { ForbiddenError, type SessionUser, assertStaff, canReassignLeads, canWriteLead, leadScopeWhere } from '@/lib/auth/rbac';
import { manualContactCnpj, manualContactPhoneFields } from '@/lib/manual-contact';
import { isValidCnpj, onlyDigits } from '@/lib/validation/cnpj';
import { parsePhone, toWhatsappNumber } from '@/lib/validation/phone';
import {
  type LeadDetailRow,
  type LeadListRow,
  addTagsToLeads,
  buildLeadWhere,
  countLeads,
  countLeadsBySituacao,
  createLead,
  findLeadByCnpj,
  findLeadById,
  findLeadByWhatsappDigits,
  findLeadFacets,
  findLeadIdsMatching,
  findLeadPage,
  findTagById,
  removeTagsFromLeads,
  updateLead,
  updateManyLeads,
} from '@/server/repositories/lead.repository';
import { createFollowUpsForLeads } from '@/server/repositories/follow-up.repository';
import { prisma } from '@/lib/db';
import { NotFoundError, BadRequestError } from '@/server/api-handler';
import { diffChanges, recordAudit } from '@/server/services/audit.service';

/**
 * Regra de negócio de leads. Chamado pelos route handlers, nunca por componente.
 */

export interface LeadListResult {
  readonly rows: SerializedLeadListRow[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  /** Quantos leads o filtro de situação cadastral deixou de fora, e por qual situação. */
  readonly hiddenBySituacao: { readonly situacao: string; readonly count: number }[];
}

export type SerializedLeadListRow = Omit<LeadListRow, 'lastContactAt' | 'nextContactAt' | 'createdAt' | 'responsavel' | 'tags' | 'lastInteractionAt'> & {
  lastContactAt: string | null;
  nextContactAt: string | null;
  createdAt: string;
  lastInteractionResult: InteractionResult | null;
  lastInteractionAt: string | null;
  responsavelNome: string | null;
  tags: { id: string; name: string; color: string }[];
};

function serializeListRow(row: LeadListRow): SerializedLeadListRow {
  const { responsavel, tags, lastContactAt, nextContactAt, createdAt, lastInteractionAt, ...rest } =
    row;
  return {
    ...rest,
    lastContactAt: lastContactAt?.toISOString() ?? null,
    nextContactAt: nextContactAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    lastInteractionAt: lastInteractionAt?.toISOString() ?? null,
    lastInteractionResult: row.lastInteractionResult,
    responsavelNome: responsavel?.name ?? null,
    tags: tags.map((entry) => entry.tag),
  };
}

export async function listLeads(user: SessionUser, filters: LeadFilters): Promise<LeadListResult> {
  assertStaff(user);
  const scope = leadScopeWhere(user);
  const key = cacheKey('leads:list', `${user.role}:${user.id}:${filterHash(filters)}`);

  return getOrSet(
    key,
    CACHE_TTL.leadList,
    async () => {
      const { rows, total } = await findLeadPage(filters, scope);

      // Transparência do filtro padrão: mostra o que ficou de fora, não esconde.
      let hiddenBySituacao: { situacao: string; count: number }[] = [];
      if (filters.situacao !== 'all') {
        const withoutSituacao = buildLeadWhere({ ...filters, situacao: 'all' }, scope);
        const groups = await countLeadsBySituacao(withoutSituacao);
        hiddenBySituacao = groups
          .filter((group) => group.value !== filters.situacao)
          .map((group) => ({ situacao: group.value, count: group.count }))
          .sort((a, b) => b.count - a.count);
      }

      return {
        rows: rows.map(serializeListRow),
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
        hiddenBySituacao,
      };
    },
    { tags: [CACHE_TAGS.leads] },
  );
}

export type SerializedLeadDetail = Omit<
  LeadDetailRow,
  | 'lastContactAt'
  | 'nextContactAt'
  | 'createdAt'
  | 'updatedAt'
  | 'dataAbertura'
  | 'capitalSocial'
  | 'lastInteractionAt'
  | 'responsavel'
  | 'tags'
> & {
  lastContactAt: string | null;
  nextContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  dataAbertura: string | null;
  capitalSocial: string | null;
  lastInteractionResult: InteractionResult | null;
  lastInteractionAt: string | null;
  responsavelNome: string | null;
  tags: { id: string; name: string; color: string }[];
  whatsappLink: string | null;
  canEdit: boolean;
};

function serializeDetail(row: LeadDetailRow, user: SessionUser): SerializedLeadDetail {
  const {
    responsavel,
    tags,
    lastContactAt,
    nextContactAt,
    createdAt,
    updatedAt,
    dataAbertura,
    capitalSocial,
    lastInteractionAt,
    ...rest
  } = row;

  const waNumber = toWhatsappNumber(row.whatsapp);

  return {
    ...rest,
    lastContactAt: lastContactAt?.toISOString() ?? null,
    nextContactAt: nextContactAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    dataAbertura: dataAbertura?.toISOString() ?? null,
    // Decimal do Prisma não sobrevive a JSON.stringify sem perda: vai como string.
    capitalSocial: capitalSocial ? capitalSocial.toString() : null,
    lastInteractionAt: lastInteractionAt?.toISOString() ?? null,
    lastInteractionResult: row.lastInteractionResult,
    responsavelNome: responsavel?.name ?? null,
    tags: tags.map((entry) => entry.tag),
    whatsappLink: waNumber ? `https://wa.me/${waNumber}` : null,
    canEdit: canWriteLead(user, { responsavelId: row.responsavelId }),
  };
}

export async function getLead(user: SessionUser, id: string): Promise<SerializedLeadDetail | null> {
  assertStaff(user);
  const scope = leadScopeWhere(user);
  const key = cacheKey('leads:detail', `${user.role}:${user.id}:${id}`);

  return getOrSet(
    key,
    CACHE_TTL.leadDetail,
    async () => {
      const row = await findLeadById(id, scope);
      return row ? serializeDetail(row, user) : null;
    },
    { tags: [CACHE_TAGS.leads, CACHE_TAGS.lead(id)] },
  );
}

export async function patchLead(
  user: SessionUser,
  id: string,
  input: LeadUpdateInput,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<SerializedLeadDetail> {
  assertStaff(user);
  const scope = leadScopeWhere(user);
  const current = await findLeadById(id, scope);
  if (!current) {
    throw new ForbiddenError('Lead não encontrado ou fora do seu escopo de acesso.');
  }
  if (!canWriteLead(user, { responsavelId: current.responsavelId })) {
    throw new ForbiddenError('Este lead é de outro responsável. Peça a reatribuição ao gestor.');
  }
  // Reatribuição vem do corpo da requisição, então é revalidada aqui: um USER
  // não muda o responsável nem que envie o campo.
  if (input.responsavelId !== undefined && !canReassignLeads(user)) {
    throw new ForbiddenError('Somente gestor ou administrador reatribui responsável.');
  }

  const data: Prisma.LeadUpdateInput = {};
  const tracked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'nextContactAt') {
      const parsed = value === null ? null : new Date(String(value));
      data.nextContactAt = parsed;
      tracked.nextContactAt = parsed;
      continue;
    }
    if (key === 'responsavelId') {
      data.responsavel = value === null ? { disconnect: true } : { connect: { id: String(value) } };
      tracked.responsavelId = value;
      continue;
    }
    (data as Record<string, unknown>)[key] = value;
    tracked[key] = value;
  }

  const changes = diffChanges(current as unknown as Record<string, unknown>, tracked);
  if (Object.keys(changes).length === 0) {
    return serializeDetail(current, user);
  }

  const updated = await updateLead(id, data);

  await recordAudit({
    userId: user.id,
    action: changes.status ? 'lead.status.change' : 'lead.update',
    entity: 'Lead',
    entityId: id,
    changes,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: changes.status ? 'lead.status.change' : 'lead.update',
    tags: MUTATION_TAGS.lead(id),
    entityId: id,
  });

  return serializeDetail(updated, user);
}

/**
 * Aplica status e/ou responsável a vários leads.
 *
 * O recorte por papel vai no `where`, então um USER que enviar id de lead de
 * outro vendedor simplesmente não atualiza aquele registro — e o resultado
 * informa quantos ficaram de fora, em vez de fingir sucesso total.
 *
 * Com `filters`, os IDs vêm do banco no momento do POST — o cliente não escolhe
 * a lista. Teto igual ao lote por ids.
 */
export async function bulkUpdateLeads(
  user: SessionUser,
  input: BulkLeadInput,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<BulkLeadResult> {
  assertStaff(user);
  if (input.responsavelId !== undefined && !canReassignLeads(user)) {
    throw new ForbiddenError('Somente gestor ou administrador reatribui responsável.');
  }

  const data: Prisma.LeadUncheckedUpdateManyInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.responsavelId !== undefined) data.responsavelId = input.responsavelId;

  const scope = leadScopeWhere(user);
  let ids: string[];
  let matched: number;
  let capped = false;

  if (input.filters) {
    const found = await findLeadIdsMatching(input.filters, scope, BULK_LIMIT);
    ids = found.ids;
    matched = found.matched;
    capped = found.matched > BULK_LIMIT;
  } else {
    ids = [...(input.ids ?? [])];
    matched = ids.length;
  }

  const updated = ids.length === 0 ? 0 : await updateManyLeads(ids, scope, data);

  await recordAudit({
    userId: user.id,
    action: 'lead.bulk.update',
    entity: 'Lead',
    entityId: null,
    changes: {
      ids: input.filters ? undefined : ids,
      filters: input.filters
        ? {
            city: input.filters.city ?? null,
            campaignId: input.filters.campaignId ?? null,
            status: input.filters.status ?? null,
            responsible: input.filters.responsible ?? null,
            state: input.filters.state ?? null,
            search: input.filters.search ?? null,
            sort: input.filters.sort,
            dir: input.filters.dir,
          }
        : undefined,
      requested: ids.length,
      matched,
      capped,
      updated,
      status: input.status ?? null,
      responsavelId: input.responsavelId ?? null,
    },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'lead.bulk.update',
    tags: [...MUTATION_TAGS.leadsBulk],
    entityId: null,
  });

  return { updated, skipped: ids.length - updated, matched, capped };
}

export interface LeadFacets {
  readonly states: { value: string; count: number }[];
  readonly cities: { value: string; count: number }[];
  readonly segments: { value: string; count: number }[];
  readonly sources: { value: string; count: number }[];
  readonly portes: { value: string; count: number }[];
  readonly responsaveis: { id: string; name: string }[];
  readonly tags: { id: string; name: string; color: string }[];
  readonly campaigns: { id: string; name: string }[];
}

export async function getLeadFacets(user: SessionUser): Promise<LeadFacets> {
  const scope = leadScopeWhere(user);
  const key = cacheKey('leads:facets', `${user.role}:${user.id}`);

  return getOrSet(
    key,
    CACHE_TTL.reference,
    async () => {
      const raw = await findLeadFacets(scope);

      return {
        states: raw.states,
        cities: raw.cities,
        segments: raw.segments,
        sources: raw.sources,
        portes: raw.portes,
        responsaveis: raw.responsaveis,
        tags: raw.tags,
        campaigns: raw.campaigns,
      };
    },
    { tags: [CACHE_TAGS.leads, CACHE_TAGS.tags, CACHE_TAGS.campaigns] },
  );
}

export async function countAllLeads(user: SessionUser): Promise<number> {
  assertStaff(user);
  return countLeads(leadScopeWhere(user));
}

export async function bulkTagLeads(
  user: SessionUser,
  input: { ids: readonly string[]; tagId: string; action: 'add' | 'remove' },
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<BulkLeadResult> {
  assertStaff(user);
  const tag = await findTagById(input.tagId);
  if (!tag) throw new NotFoundError('Tag não encontrada.');

  const scope = leadScopeWhere(user);
  const affected =
    input.action === 'add'
      ? await addTagsToLeads(input.ids, input.tagId, scope)
      : await removeTagsFromLeads(input.ids, input.tagId, scope);

  await recordAudit({
    userId: user.id,
    action: 'lead.bulk.tag',
    entity: 'Lead',
    changes: { ...input, affected, tag: tag.name },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'lead.bulk.tag',
    tags: [...MUTATION_TAGS.leadsBulk, CACHE_TAGS.tags],
    entityId: null,
  });

  return {
    updated: affected,
    skipped: input.ids.length - affected,
    matched: input.ids.length,
    capped: false,
  };
}

export async function bulkScheduleFollowUps(
  user: SessionUser,
  input: { ids: readonly string[]; scheduledFor: string; note?: string | null },
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<BulkLeadResult> {
  assertStaff(user);
  const scope = leadScopeWhere(user);
  const leads = await prisma.lead.findMany({
    where: { AND: [{ id: { in: [...input.ids] } }, scope] },
    select: { id: true, responsavelId: true },
  });

  const scheduledFor = new Date(input.scheduledFor);
  const created = await createFollowUpsForLeads(
    leads,
    user.id,
    user.id,
    scheduledFor,
    input.note ?? null,
  );

  await updateManyLeads(
    leads.map((lead) => lead.id),
    scope,
    { nextContactAt: scheduledFor },
  );

  await recordAudit({
    userId: user.id,
    action: 'lead.bulk.followup',
    entity: 'FollowUp',
    changes: { requested: input.ids.length, created, scheduledFor: scheduledFor.toISOString() },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'lead.bulk.followup',
    tags: [...MUTATION_TAGS.leadsBulk, ...MUTATION_TAGS.followUp],
    entityId: null,
  });

  return {
    updated: created,
    skipped: input.ids.length - leads.length,
    matched: input.ids.length,
    capped: false,
  };
}

export { manualLeadSchema, type ManualLeadInput };

async function fillMissingManualPhones(
  lead: { id: string; whatsapp: string | null; telefone?: string | null },
  phoneDigits: string | null,
) {
  if (!phoneDigits) return;
  const data: { whatsapp?: string; telefone?: string } = {};
  if (!lead.whatsapp) data.whatsapp = phoneDigits;
  if (!lead.telefone) data.telefone = phoneDigits;
  if (Object.keys(data).length === 0) return;
  await updateLead(lead.id, data);
}

function serializeManualLead(
  lead: { id: string; cnpj: string; razaoSocial: string },
  created: boolean,
) {
  return { id: lead.id, cnpj: lead.cnpj, razaoSocial: lead.razaoSocial, created };
}

export async function createManualLead(
  user: SessionUser,
  input: ManualLeadInput,
  options?: { origem?: string; status?: LeadStatus; responsavelId?: string },
) {
  assertStaff(user);
  const name = input.name.trim();
  const cnpjRaw = input.cnpj?.trim() || '';
  const phoneRaw = input.whatsapp?.trim() || '';
  const parsedPhone = phoneRaw ? parsePhone(phoneRaw) : null;
  if (phoneRaw && !parsedPhone) {
    throw new BadRequestError('WhatsApp inválido. Use DDD + número.');
  }
  const phoneDigits = parsedPhone?.digits ?? null;
  if (!cnpjRaw && !phoneDigits) {
    throw new BadRequestError('Informe WhatsApp ou CNPJ.');
  }

  let cnpj: string | null = null;
  if (cnpjRaw) {
    if (!isValidCnpj(cnpjRaw)) {
      throw new BadRequestError('CNPJ inválido. Deixe em branco se a empresa não está na Receita.');
    }
    cnpj = onlyDigits(cnpjRaw);
  }

  if (cnpj) {
    const byCnpj = await findLeadByCnpj(cnpj);
    if (byCnpj) {
      if (!canWriteLead(user, byCnpj)) {
        throw new ForbiddenError('Este CNPJ já está em um lead fora do seu escopo.');
      }
      await fillMissingManualPhones(byCnpj, phoneDigits);
      return serializeManualLead(byCnpj, false);
    }
  }

  if (phoneDigits) {
    const byPhone = await findLeadByWhatsappDigits(phoneDigits);
    if (byPhone) {
      if (!canWriteLead(user, byPhone)) {
        throw new ForbiddenError('Este número já está em um lead de outro vendedor.');
      }
      await fillMissingManualPhones(byPhone, phoneDigits);
      return serializeManualLead(byPhone, false);
    }
  }

  const origem = options?.origem ?? MANUAL_LEAD_SOURCE;
  const status = options?.status ?? 'NEW';
  const key = cnpj ?? manualContactCnpj(phoneDigits);

  const existingKey = await findLeadByCnpj(key);
  if (existingKey) {
    if (!canWriteLead(user, existingKey)) {
      throw new ForbiddenError('Este contato já está na base de outro vendedor.');
    }
    await fillMissingManualPhones(existingKey, phoneDigits);
    return serializeManualLead(existingKey, false);
  }

  try {
    const phones = manualContactPhoneFields(parsedPhone);
    const lead = await createLead({
      cnpj: key,
      razaoSocial: name,
      nomeFantasia: name,
      whatsapp: phones.whatsapp,
      telefone: phones.telefone,
      phones: phones.phones,
      origem,
      status,
      responsavelId: options?.responsavelId ?? user.id,
      situacaoCadastral: 'ATIVA',
    });

    await recordAudit({
      userId: user.id,
      action: 'lead.create.manual',
      entity: 'Lead',
      entityId: lead.id,
      changes: { origem, hasCnpj: Boolean(cnpj) },
    });
    await notifyChange({
      type: 'lead.create',
      tags: MUTATION_TAGS.lead(lead.id),
      entityId: lead.id,
    });

    return serializeManualLead(lead, true);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const again = await findLeadByCnpj(key);
      if (again && canWriteLead(user, again)) {
        return serializeManualLead(again, false);
      }
      throw new ForbiddenError('Este contato já está na base.');
    }
    throw error;
  }
}
