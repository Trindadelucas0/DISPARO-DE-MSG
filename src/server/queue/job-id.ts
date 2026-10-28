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

/** Como o jobId da campanha começa em cada fila (primeira onda, retorno, retry). */
const CAMPAIGN_JOB_PREFIXES = ['', 'followup-', 'retry-', 'retry-followup-'] as const;

/**
 * Job pendente desta campanha? Pausar e cancelar tiram esses jobs da fila: o
 * processador até pula a campanha parada, mas o job pulado gasta um slot do
 * limiter e atrasa todas as outras campanhas no mesmo ritmo.
 */
export function isCampaignJobId(jobId: string, campaignId: string): boolean {
  const id = toBullJobId(campaignId);
  return CAMPAIGN_JOB_PREFIXES.some((prefix) => jobId.startsWith(`${prefix}${id}-`));
}
