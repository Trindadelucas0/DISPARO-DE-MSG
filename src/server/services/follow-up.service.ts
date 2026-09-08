import type { FollowUpStatus } from '@prisma/client';

import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { startOfDay } from '@/lib/dates';
import {
  assertStaff,
  ForbiddenError,
  canWriteLead,
  leadScopeWhere,
  type SessionUser,
} from '@/lib/auth/rbac';
import { NotFoundError } from '@/server/api-handler';
import type { FollowUpListFilters } from '@/features/interactions/schema';
import {
  createFollowUp,
  findFollowUp,
  listFollowUps,
  updateFollowUp,
  type FollowUpRow,
  type FollowUpTabCounts,
} from '@/server/repositories/follow-up.repository';
import { findLeadById, updateLead } from '@/server/repositories/lead.repository';
import { recordAudit } from '@/server/services/audit.service';

function displayStatus(row: FollowUpRow): FollowUpStatus {
  if (row.status === 'PENDING' && row.scheduledFor < startOfDay()) return 'OVERDUE';
  return row.status;
}

function serialize(row: FollowUpRow) {
  return {
    id: row.id,
    leadId: row.leadId,
    razaoSocial: row.lead.razaoSocial,
    nomeFantasia: row.lead.nomeFantasia,
    cidade: row.lead.cidade,
    estado: row.lead.estado,
    whatsapp: row.lead.whatsapp,
    telefone: row.lead.telefone,
    email: row.lead.email,
    leadStatus: row.lead.status,
    lastInteractionResult: row.lead.lastInteractionResult,
    lastInteractionAt: row.lead.lastInteractionAt?.toISOString() ?? null,
    responsavelId: row.responsavelId,
    responsavelNome: row.responsavel.name,
    scheduledFor: row.scheduledFor.toISOString(),
    note: row.note,
    status: displayStatus(row),
    storedStatus: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SerializedFollowUp = ReturnType<typeof serialize>;

export interface FollowUpListResult {
  readonly items: SerializedFollowUp[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly counts: FollowUpTabCounts;
}

export async function listUserFollowUps(
  user: SessionUser,
  filters: FollowUpListFilters,
): Promise<FollowUpListResult> {
  assertStaff(user);
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;
  const { rows, total, counts } = await listFollowUps(leadScopeWhere(user), {
    tab: filters.tab,
    status: filters.status,
    responsible: filters.responsible,
    leadStatus: filters.leadStatus,
    state: filters.state,
    from,
    to,
    page: filters.page,
    limit: filters.limit,
  });
  return {
    items: rows.map(serialize),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    counts,
  };
}

export async function scheduleFollowUp(
  user: SessionUser,
  input: { leadId: string; scheduledFor: string; note?: string | null },
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  assertStaff(user);
  const lead = await findLeadById(input.leadId, leadScopeWhere(user));
  if (!lead) throw new NotFoundError('Lead não encontrado ou fora do seu escopo de acesso.');
  if (!canWriteLead(user, lead)) {
    throw new ForbiddenError('Este lead é de outro responsável. Peça a reatribuição ao gestor.');
  }

  const scheduledFor = new Date(input.scheduledFor);
  const row = await createFollowUp({
    leadId: input.leadId,
    responsavelId: lead.responsavelId ?? user.id,
    criadoPorId: user.id,
    scheduledFor,
    note: input.note ?? null,
  });

  await updateLead(input.leadId, { nextContactAt: scheduledFor });

  await recordAudit({
    userId: user.id,
    action: 'followup.create',
    entity: 'FollowUp',
    entityId: row.id,
    changes: { leadId: input.leadId, scheduledFor: scheduledFor.toISOString() },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'followup.create',
    tags: MUTATION_TAGS.followUp,
    entityId: row.id,
  });

  return serialize(row);
}

export async function patchFollowUp(
  user: SessionUser,
  id: string,
  input: { status?: FollowUpStatus; scheduledFor?: string; note?: string | null },
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  assertStaff(user);
  const current = await findFollowUp(id, leadScopeWhere(user));
  if (!current) throw new NotFoundError('Follow-up não encontrado ou fora do seu escopo.');
  if (!canWriteLead(user, { responsavelId: current.lead ? current.responsavelId : user.id })) {
    throw new ForbiddenError('Você não pode alterar o follow-up de outro responsável.');
  }

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : undefined;
  const completed =
    input.status === 'COMPLETED' || input.status === 'CANCELLED' ? new Date() : undefined;

  const updated = await updateFollowUp(id, {
    ...(input.status ? { status: input.status } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(completed ? { completedAt: completed } : {}),
  });

  if (scheduledFor && (input.status === undefined || input.status === 'PENDING')) {
    await updateLead(current.leadId, { nextContactAt: scheduledFor });
  }

  await recordAudit({
    userId: user.id,
    action: 'followup.update',
    entity: 'FollowUp',
    entityId: id,
    changes: { ...input },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'followup.update',
    tags: MUTATION_TAGS.followUp,
    entityId: id,
  });

  return serialize(updated);
}
