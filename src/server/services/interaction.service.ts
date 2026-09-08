import type { InteractionResult, InteractionType, LeadStatus } from '@prisma/client';

import { LEAD_STATUS_META } from '@/constants/lead-status';
import { suggestedStatusFromResult } from '@/constants/interactions';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { addDays, startOfDay } from '@/lib/dates';
import {
  assertStaff,
  ForbiddenError,
  canWriteLead,
  leadScopeWhere,
  type SessionUser,
} from '@/lib/auth/rbac';
import { NotFoundError } from '@/server/api-handler';
import { createInteraction, findInteractionById, listInteractions, updateInteraction } from '@/server/repositories/interaction.repository';
import { cancelPendingFollowUps, createFollowUp } from '@/server/repositories/follow-up.repository';
import { findLeadById, updateLead } from '@/server/repositories/lead.repository';
import { recordAudit } from '@/server/services/audit.service';

export interface CreateInteractionInput {
  readonly type: InteractionType;
  readonly result?: InteractionResult | null;
  readonly content?: string | null;
  readonly templateId?: string | null;
  readonly scheduledFor?: string | null;
  readonly note?: string | null;
  /** Se informado, força o status; senão o serviço sugere a partir do resultado. */
  readonly status?: LeadStatus;
}

function serializeInteraction(row: Awaited<ReturnType<typeof listInteractions>>[number]) {
  return {
    id: row.id,
    leadId: row.leadId,
    userId: row.userId,
    userName: row.user.name,
    type: row.type,
    result: row.result,
    content: row.content,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLeadInteractions(user: SessionUser, leadId: string) {
  assertStaff(user);
  const lead = await findLeadById(leadId, leadScopeWhere(user));
  if (!lead) throw new NotFoundError('Lead não encontrado ou fora do seu escopo de acesso.');
  const rows = await listInteractions(leadId);
  return rows.map(serializeInteraction);
}

export async function recordInteraction(
  user: SessionUser,
  leadId: string,
  input: CreateInteractionInput,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  assertStaff(user);
  const scope = leadScopeWhere(user);
  const lead = await findLeadById(leadId, scope);
  if (!lead) throw new NotFoundError('Lead não encontrado ou fora do seu escopo de acesso.');
  if (!canWriteLead(user, lead)) {
    throw new ForbiddenError('Este lead é de outro responsável. Peça a reatribuição ao gestor.');
  }

  const interaction = await createInteraction({
    leadId,
    userId: user.id,
    type: input.type,
    result: input.result ?? null,
    content: input.content ?? null,
    templateId: input.templateId ?? null,
  });

  if (input.result === 'OPENED') {
    await recordAudit({
      userId: user.id,
      action: 'interaction.create',
      entity: 'Interaction',
      entityId: interaction.id,
      changes: {
        leadId,
        type: input.type,
        result: 'OPENED',
        status: null,
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    await notifyChange({
      type: 'interaction.create',
      tags: [...MUTATION_TAGS.lead(leadId), ...MUTATION_TAGS.followUp],
      entityId: leadId,
    });
    return serializeInteraction(interaction);
  }

  const nextStatus = await applyInteractionSideEffects(user, lead, input);

  await recordAudit({
    userId: user.id,
    action: 'interaction.create',
    entity: 'Interaction',
    entityId: interaction.id,
    changes: {
      leadId,
      type: input.type,
      result: input.result ?? null,
      status: nextStatus ?? null,
    },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'interaction.create',
    tags: [...MUTATION_TAGS.lead(leadId), ...MUTATION_TAGS.followUp],
    entityId: leadId,
  });

  return serializeInteraction(interaction);
}

async function applyInteractionSideEffects(
  user: SessionUser,
  lead: NonNullable<Awaited<ReturnType<typeof findLeadById>>>,
  input: CreateInteractionInput,
): Promise<LeadStatus | null> {
  const suggested = input.status
    ? input.status
    : input.result
      ? suggestedStatusFromResult(input.result, lead.status)
      : null;
  const nextStatus = suggested ?? null;

  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    scheduledFor = new Date(input.scheduledFor);
  } else if (
    input.scheduledFor === undefined &&
    (input.result === 'NO_RESPONSE' || input.result === 'CALLBACK')
  ) {
    scheduledFor = addDays(startOfDay(), input.result === 'CALLBACK' ? 1 : 2);
  }

  const terminal = nextStatus ? LEAD_STATUS_META[nextStatus].terminal : false;

  await updateLead(lead.id, {
    lastContactAt: new Date(),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(scheduledFor && !terminal ? { nextContactAt: scheduledFor } : {}),
    ...(terminal ? { nextContactAt: null } : {}),
  });

  if (terminal) {
    await cancelPendingFollowUps(lead.id);
  } else if (scheduledFor) {
    await createFollowUp({
      leadId: lead.id,
      responsavelId: lead.responsavelId ?? user.id,
      criadoPorId: user.id,
      scheduledFor,
      note: input.note ?? null,
    });
  }

  return nextStatus;
}

export async function patchInteraction(
  user: SessionUser,
  leadId: string,
  interactionId: string,
  input: CreateInteractionInput,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const scope = leadScopeWhere(user);
  const lead = await findLeadById(leadId, scope);
  if (!lead) throw new NotFoundError('Lead não encontrado ou fora do seu escopo de acesso.');
  if (!canWriteLead(user, lead)) {
    throw new ForbiddenError('Este lead é de outro responsável. Peça a reatribuição ao gestor.');
  }

  const current = await findInteractionById(interactionId, leadId);
  if (!current) throw new NotFoundError('Interação não encontrada neste lead.');

  const updated = await updateInteraction(interactionId, {
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.type ? { type: input.type } : {}),
  });

  if (input.result && input.result !== 'OPENED') {
    await applyInteractionSideEffects(user, lead, {
      type: input.type ?? updated.type,
      result: input.result,
      scheduledFor: input.scheduledFor,
      note: input.note,
      status: input.status,
    });
  }

  await recordAudit({
    userId: user.id,
    action: 'interaction.update',
    entity: 'Interaction',
    entityId: interactionId,
    changes: {
      leadId,
      result: input.result ?? null,
      from: current.result,
    },
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });

  await notifyChange({
    type: 'interaction.update',
    tags: [...MUTATION_TAGS.lead(leadId), ...MUTATION_TAGS.followUp],
    entityId: leadId,
  });

  return serializeInteraction(updated);
}
