import { ImportIssueSeverity } from '@prisma/client';
import { z } from 'zod';

import { IMPORT_FIELDS } from '@/server/services/import/columns';

/** Contrato dos endpoints de importação. */

const uploadId = z.string().uuid('Identificador de upload inválido.');

/**
 * Mapeamento sobrescrito pelo usuário: campo → índice da coluna.
 * `null` desliga um campo que a detecção automática havia associado.
 */
export const columnMappingSchema = z.record(
  z.enum(IMPORT_FIELDS),
  z.number().int().min(0).max(500).nullable(),
);

export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;

export const previewRequestSchema = z
  .object({
    uploadId,
    onlyActive: z.boolean().default(true),
    mapping: columnMappingSchema.optional(),
  })
  .strict();

export const runRequestSchema = previewRequestSchema.extend({
  /** Nome original do arquivo, usado como `origem` do lead e rótulo do job. */
  fileName: z.string().trim().min(1).max(255),
});

export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;

export const importErrorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(200).default(50),
  severity: z.nativeEnum(ImportIssueSeverity).optional(),
});

/**
 * Converte o mapa do cliente para o formato do serviço.
 *
 * `null` (campo desligado pelo usuário) vira `undefined` de propósito: o
 * serviço faz `{...detecção, ...override}`, então a chave precisa existir com
 * `undefined` para anular o que a detecção automática havia encontrado.
 */
export function toColumnMapping(
  input: ColumnMappingInput | undefined,
): Record<string, number | undefined> | undefined {
  if (!input) return undefined;
  const mapping: Record<string, number | undefined> = {};
  for (const [field, index] of Object.entries(input)) {
    mapping[field] = index === null ? undefined : index;
  }
  return mapping;
}
