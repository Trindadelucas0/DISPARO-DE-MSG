import type { Lead } from '@prisma/client';

import type { TemplateVars } from '@/lib/template';

function firstToken(value: string | null | undefined): string {
  if (!value) return '';
  const token = value.trim().split(/\s+/)[0];
  return token ?? '';
}

export function buildLeadTemplateVars(
  lead: Pick<
    Lead,
    | 'razaoSocial'
    | 'nomeFantasia'
    | 'cidade'
    | 'estado'
    | 'cnpj'
    | 'telefone'
    | 'whatsapp'
    | 'email'
    | 'segmento'
    | 'porte'
  >,
  options: { readonly vendedor?: string | null; readonly responsavel?: string | null } = {},
): TemplateVars {
  const empresa = lead.nomeFantasia?.trim() || lead.razaoSocial;
  const contato = lead.nomeFantasia?.trim() || lead.razaoSocial;
  return {
    razaoSocial: lead.razaoSocial,
    nomeFantasia: lead.nomeFantasia ?? '',
    cidade: lead.cidade ?? '',
    estado: lead.estado ?? '',
    cnpj: lead.cnpj,
    telefone: lead.telefone ?? '',
    whatsapp: lead.whatsapp ?? '',
    email: lead.email ?? '',
    vendedor: options.vendedor ?? '',
    responsavel: options.responsavel ?? options.vendedor ?? '',
    primeiroNome: firstToken(contato),
    nomeContato: contato,
    segmento: lead.segmento ?? '',
    porte: lead.porte ?? '',
    empresa,
    pais: 'Brasil',
  };
}

export function recipientIdempotencyKey(campaignId: string, leadId: string): string {
  return `${campaignId}-${leadId}`;
}

export function followUpIdempotencyKey(
  campaignId: string,
  leadId: string,
  retryToken?: string | number,
): string {
  return retryToken
    ? `followup-${campaignId}-${leadId}-r${retryToken}`
    : `followup-${campaignId}-${leadId}`;
}

/** Primeiros N destinatários já elegíveis (WhatsApp + opt-out). `null` = todos. */
export function takeRecipientLimit<T>(rows: readonly T[], limit: number | null | undefined): T[] {
  if (limit == null || !Number.isInteger(limit) || limit < 1) return [...rows];
  return rows.slice(0, limit);
}

/** Próximo lote: tira quem já está na campanha e só então aplica o teto. */
export function nextRecipientBatch<T extends { leadId: string }>(
  rows: readonly T[],
  existingLeadIds: ReadonlySet<string>,
  limit: number | null | undefined,
): T[] {
  return takeRecipientLimit(
    rows.filter((row) => !existingLeadIds.has(row.leadId)),
    limit,
  );
}
