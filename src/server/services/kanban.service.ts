import type { InteractionResult, LeadStatus } from '@prisma/client';

import type { LeadFilters } from '@/features/leads/schema';
import { CACHE_TAGS, CACHE_TTL, cacheKey, filterHash, getOrSet } from '@/lib/cache';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { startOfDay } from '@/lib/dates';
import {
  ForbiddenError,
  canViewLeadContact,
  canWriteLead,
  leadScopeWhere,
  type SessionUser,
} from '@/lib/auth/rbac';
import { NotFoundError } from '@/server/api-handler';
import {
  buildLeadWhere,
  findKanbanColumn,
  findLeadById,
  updateLead,
} from '@/server/repositories/lead.repository';
import { withLastResultFilter } from '@/server/repositories/interaction.repository';
import { prisma } from '@/lib/db';
import { diffChanges, recordAudit } from '@/server/services/audit.service';

const COLUMN_PAGE = 40;

export interface KanbanCard {
  readonly id: string;
  readonly razaoSocial: string;
  readonly nomeFantasia: string | null;
  readonly cidade: string | null;
  readonly estado: string | null;
  readonly whatsapp: string | null;
  readonly telefone: string | null;
  readonly nextContactAt: string | null;
  readonly lastContactAt: string | null;
  readonly lastInteractionResult: InteractionResult | null;
  readonly lastInteractionAt: string | null;
  readonly responsavelNome: string | null;
  readonly mine: boolean;
  readonly status: LeadStatus;
  readonly canWrite: boolean;
}

export interface KanbanColumn {
  readonly status: LeadStatus;
  readonly total: number;
  readonly overdueCount: number;
  readonly nextOffset: number | null;
  readonly cards: readonly KanbanCard[];
}

export async function getKanbanColumn(
  user: SessionUser,
  status: LeadStatus,
  offset = 0,
  filters: LeadFilters,
): Promise<KanbanColumn> {
  const scope = leadScopeWhere(user);
  const key = cacheKey(
    'kanban',
    `${user.role}:${user.id}:${status}:${offset}:${filterHash(filters)}`,
  );

  return getOrSet(
    key,
    CACHE_TTL.leadList,
    async () => {
      const where = await withLastResultFilter(buildLeadWhere(filters, scope), filters.lastResult);
      const today = startOfDay();
      const [{ rows, nextOffset, total }, overdueCount] = await Promise.all([
        findKanbanColumn(status, where, offset, COLUMN_PAGE),
        prisma.lead.count({
          where: { AND: [where, { status }, { nextContactAt: { lt: today } }] },
        }),
      ]);
      return {
        status,
        total,
        overdueCount,
        nextOffset,
        cards: rows.map((row) => ({
          id: row.id,
          razaoSocial: row.razaoSocial,
          nomeFantasia: row.nomeFantasia,
          cidade: row.cidade,
          estado: row.estado,
          whatsapp: canViewLeadContact(user) ? row.whatsapp : null,
          telefone: canViewLeadContact(user) ? row.telefone : null,
          nextContactAt: row.nextContactAt?.toISOString() ?? null,
          lastContactAt: row.lastContactAt?.toISOString() ?? null,
          lastInteractionResult: row.lastInteractionResult,
          lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
          responsavelNome: row.responsavel?.name ?? null,
          mine: row.responsavelId === user.id,
          status: row.status,
          canWrite: canWriteLead(user, row),
        })),
      };
    },
    { tags: [CACHE_TAGS.leads] },
  );
}

async function applyLeadStatusChange(
  actorUserId: string,
  leadId: string,
  currentStatus: LeadStatus,
  status: LeadStatus,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  if (currentStatus === status) {
    return { id: leadId, status, unchanged: true as const };
  }

  const updated = await updateLead(leadId, { status });
  const changes = diffChanges(
    { status: currentStatus } as Record<string, unknown>,
    { status },
  );

  await recordAudit({
    userId: actorUserId,
    action: 'lead.status.change',
    entity: 'Lead',
    entityId: leadId,
    changes,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'lead.status.change',
    tags: MUTATION_TAGS.lead(leadId),
    entityId: leadId,
  });

  return { id: updated.id, status: updated.status, unchanged: false as const };
}

export async function changeLeadStatus(
  user: SessionUser,
  id: string,
  status: LeadStatus,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const current = await findLeadById(id, leadScopeWhere(user));
  if (!current) throw new NotFoundError('Lead não encontrado ou fora do seu escopo de acesso.');
  if (!canWriteLead(user, current)) {
    throw new ForbiddenError('Este lead é de outro responsável. Peça a reatribuição ao gestor.');
  }
  return applyLeadStatusChange(user.id, id, current.status, status, context);
}

/** Vendedor na conversa (mesmo sem ser o responsável do lead) pode mover o funil. */
export async function changeLeadStatusFromConversation(
  user: SessionUser,
  leadId: string,
  currentStatus: LeadStatus,
  status: LeadStatus,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  return applyLeadStatusChange(user.id, leadId, currentStatus, status, context);
}
