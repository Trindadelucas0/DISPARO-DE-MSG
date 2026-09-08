import { prisma } from '@/lib/db';

/**
 * Registro de auditoria. Toda mutação relevante passa por aqui.
 *
 * Falha de auditoria não derruba a operação do usuário, mas é logada: perder o
 * registro é um problema de observabilidade, não motivo para desfazer uma
 * escrita já confirmada no banco.
 */

export interface AuditInput {
  readonly userId: string | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId?: string | null;
  readonly changes?: Record<string, unknown> | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        changes: (input.changes ?? undefined) as never,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] falha ao gravar log:', (error as Error).message, input.action);
  }
}

/** Diff campo a campo: o log guarda o que mudou, não o registro inteiro. */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, nextValue] of Object.entries(after)) {
    if (nextValue === undefined) continue;
    const previousValue = before[key];
    const normalizedPrev = previousValue instanceof Date ? previousValue.toISOString() : previousValue;
    const normalizedNext = nextValue instanceof Date ? nextValue.toISOString() : nextValue;
    if (normalizedPrev !== normalizedNext) {
      changes[key] = { from: normalizedPrev ?? null, to: normalizedNext ?? null };
    }
  }

  return changes;
}
