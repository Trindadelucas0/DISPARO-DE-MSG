import { LeadStatus } from '@prisma/client';
import { z } from 'zod';

/** Contrato da barra de ações em lote da tela /leads. */

export const BULK_LIMIT = 500;

export const bulkLeadSchema = z
  .object({
    ids: z
      .array(z.string().trim().min(1))
      .min(1, 'Selecione pelo menos um lead.')
      .max(BULK_LIMIT, `Máximo de ${BULK_LIMIT} leads por operação.`),
    status: z.nativeEnum(LeadStatus).optional(),
    /** `null` remove o responsável e devolve o lead para a fila de triagem. */
    responsavelId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.status !== undefined || value.responsavelId !== undefined,
    'Informe o status ou o responsável a aplicar.',
  );

export type BulkLeadInput = z.infer<typeof bulkLeadSchema>;

export interface BulkLeadResult {
  readonly updated: number;
  /** Selecionados que o papel do usuário não permite alterar. Nunca some calado. */
  readonly skipped: number;
}
