import type { InteractionResult, InteractionType, Prisma } from '@prisma/client';
import { Prisma as PrismaNs } from '@prisma/client';

import { prisma } from '@/lib/db';

export interface LastInteractionFields {
  readonly lastInteractionResult: InteractionResult | null;
  readonly lastInteractionAt: Date | null;
}

/**
 * Última interação de cada lead via subquery DISTINCT ON — sem coluna nova
 * em Lead e sem filtrar a base em JavaScript.
 */
export async function findLastInteractionsByLeadIds(
  leadIds: readonly string[],
): Promise<Map<string, LastInteractionFields>> {
  const map = new Map<string, LastInteractionFields>();
  if (leadIds.length === 0) return map;

  const rows = await prisma.$queryRaw<
    Array<{ leadId: string; result: InteractionResult | null; occurredAt: Date }>
  >`
    SELECT DISTINCT ON ("leadId") "leadId", result, "occurredAt"
    FROM interactions
    WHERE "leadId" IN (${PrismaNs.join(leadIds)})
    ORDER BY "leadId", "occurredAt" DESC
  `;

  for (const row of rows) {
    map.set(row.leadId, {
      lastInteractionResult: row.result,
      lastInteractionAt: row.occurredAt,
    });
  }
  return map;
}

export async function attachLastInteraction<T extends { id: string }>(
  rows: readonly T[],
): Promise<Array<T & LastInteractionFields>> {
  const map = await findLastInteractionsByLeadIds(rows.map((row) => row.id));
  return rows.map((row) => {
    const hit = map.get(row.id);
    return {
      ...row,
      lastInteractionResult: hit?.lastInteractionResult ?? null,
      lastInteractionAt: hit?.lastInteractionAt ?? null,
    };
  });
}

/**
 * IDs cujo resultado da última interação é `result`. Subquery DISTINCT ON —
 * não hidrata o lead.
 */
export async function findLeadIdsByLastResult(result: InteractionResult): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ leadId: string }>>`
    SELECT "leadId"
    FROM (
      SELECT DISTINCT ON ("leadId") "leadId", result
      FROM interactions
      ORDER BY "leadId", "occurredAt" DESC
    ) last
    WHERE last.result = ${result}::"InteractionResult"
  `;
  return rows.map((row) => row.leadId);
}

export async function withLastResultFilter(
  where: Prisma.LeadWhereInput,
  lastResult: InteractionResult | undefined,
): Promise<Prisma.LeadWhereInput> {
  if (!lastResult) return where;
  const ids = await findLeadIdsByLastResult(lastResult);
  if (ids.length === 0) return { AND: [where, { id: { in: ['__none__'] } }] };
  return { AND: [where, { id: { in: ids } }] };
}

export const INTERACTION_SELECT = {
  id: true,
  leadId: true,
  userId: true,
  type: true,
  result: true,
  content: true,
  templateId: true,
  occurredAt: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
  template: { select: { id: true, name: true } },
} satisfies Prisma.InteractionSelect;

export type InteractionRow = Prisma.InteractionGetPayload<{ select: typeof INTERACTION_SELECT }>;

export async function listInteractions(
  leadId: string,
): Promise<InteractionRow[]> {
  return prisma.interaction.findMany({
    where: { leadId },
    select: INTERACTION_SELECT,
    orderBy: { occurredAt: 'desc' },
    take: 200,
  });
}

export async function createInteraction(data: {
  leadId: string;
  userId: string;
  type: InteractionType;
  result?: InteractionResult | null;
  content?: string | null;
  templateId?: string | null;
  occurredAt?: Date;
}): Promise<InteractionRow> {
  return prisma.interaction.create({
    data: {
      leadId: data.leadId,
      userId: data.userId,
      type: data.type,
      result: data.result ?? null,
      content: data.content ?? null,
      templateId: data.templateId ?? null,
      occurredAt: data.occurredAt ?? new Date(),
    },
    select: INTERACTION_SELECT,
  });
}

export async function updateInteraction(
  id: string,
  data: Prisma.InteractionUpdateInput,
): Promise<InteractionRow> {
  return prisma.interaction.update({ where: { id }, data, select: INTERACTION_SELECT });
}

export async function findInteractionById(
  id: string,
  leadId: string,
): Promise<InteractionRow | null> {
  return prisma.interaction.findFirst({
    where: { id, leadId },
    select: INTERACTION_SELECT,
  });
}
