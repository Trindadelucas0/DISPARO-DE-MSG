import type { LeadStatus } from '@prisma/client';

import { outboundSendSuggestedStatus } from '@/constants/interactions';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { prisma } from '@/lib/db';
import { updateLead } from '@/server/repositories/lead.repository';

/**
 * Disparo e Inbox: Novo/Pronto → Contatado. Não regride Qualificado nem terminais.
 * Sem sessão de vendedor (worker de campanha).
 */
export async function markLeadContactedOnOutbound(leadId: string): Promise<LeadStatus | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true },
  });
  if (!lead) return null;
  const next = outboundSendSuggestedStatus(lead.status);
  if (!next) return null;
  await updateLead(lead.id, { status: next, lastContactAt: new Date() });
  await notifyChange({
    type: 'lead.status.change',
    tags: MUTATION_TAGS.lead(lead.id),
    entityId: lead.id,
  });
  return next;
}
