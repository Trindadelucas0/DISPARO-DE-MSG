/**
 * BullMQ recusa `:` em jobId customizado (`Custom Id cannot contain :`).
 * CUID da aplicação não usa `:`; a chave antiga era `campaignId:leadId`.
 */
export function toBullJobId(id: string): string {
  return id.replaceAll(':', '-');
}

export function isBullDuplicateJobError(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}
