import { LeadStatus } from '@prisma/client';
import { z } from 'zod';

import { leadFiltersSchema, type LeadFilters } from '@/features/leads/schema';

/** Contrato da barra de ações em lote da tela /leads. */

export const BULK_LIMIT = 500;

export const bulkLeadSchema = z
  .object({
    ids: z
      .array(z.string().trim().min(1))
      .min(1, 'Selecione pelo menos um lead.')
      .max(BULK_LIMIT, `Máximo de ${BULK_LIMIT} leads por operação.`)
      .optional(),
    /** Recorte da listagem. O servidor resolve os IDs; o cliente não manda a lista. */
    filters: leadFiltersSchema.optional(),
    status: z.nativeEnum(LeadStatus).optional(),
    /** `null` remove o responsável e devolve o lead para a fila de triagem. */
    responsavelId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasIds = value.ids !== undefined;
    const hasFilters = value.filters !== undefined;
    if (hasIds === hasFilters) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe ids ou filters, não os dois.',
      });
    }
    if (value.status === undefined && value.responsavelId === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o status ou o responsável a aplicar.',
      });
    }
  });

export type BulkLeadInput = z.infer<typeof bulkLeadSchema>;

export interface BulkLeadResult {
  readonly updated: number;
  /** Selecionados que o papel do usuário não permite alterar. Nunca some calado. */
  readonly skipped: number;
  /** Quantos o recorte alcançou no banco, antes do teto. */
  readonly matched: number;
  /** Verdadeiro quando o filtro tinha mais leads que o teto da operação. */
  readonly capped: boolean;
}

export function summarizeBulkMatch(
  matched: number,
  limit: number = BULK_LIMIT,
): { take: number; capped: boolean } {
  return { take: Math.min(matched, limit), capped: matched > limit };
}

export function bulkAssignConfirmMessage(input: {
  readonly count: number;
  readonly destName: string;
  readonly matchFilter: boolean;
  readonly matched?: number;
  readonly unassign?: boolean;
}): string {
  if (input.unassign) {
    if (input.matchFilter && input.matched !== undefined && input.matched > input.count) {
      return `Há ${input.matched} leads no filtro. Remover responsável dos primeiros ${input.count}?`;
    }
    if (input.matchFilter) {
      return `Remover responsável de ${input.count} lead(s) do filtro atual?`;
    }
    return `Remover responsável de ${input.count} lead(s) selecionados?`;
  }
  if (input.matchFilter && input.matched !== undefined && input.matched > input.count) {
    return `Há ${input.matched} leads no filtro. Atribuir os primeiros ${input.count} a ${input.destName}?`;
  }
  if (input.matchFilter) {
    return `Atribuir ${input.count} lead(s) do filtro atual a ${input.destName}?`;
  }
  return `Atribuir ${input.count} lead(s) selecionados a ${input.destName}?`;
}

/** Página não faz parte do recorte: o servidor corta pelos primeiros N na ordem. */
export function filtersForBulk(filters: LeadFilters): LeadFilters {
  return { ...filters, page: 1 };
}
