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

export interface RecipientCandidate {
  readonly leadId: string;
  /** Número nacional (DDD + número, sem o 55). */
  readonly phone: string;
}

export interface RecipientSelection<T> {
  readonly rows: T[];
  readonly skippedOptOut: number;
  readonly skippedDuplicatePhone: number;
}

export interface RecipientSelectionOptions {
  /** Números em opt-out, já normalizados. Vazio quando a campanha não exclui. */
  readonly optedOutPhones: ReadonlySet<string>;
  /** Números que já estão na campanha — bloqueiam a segunda mensagem. */
  readonly existingPhones: ReadonlySet<string>;
  readonly existingLeadIds: ReadonlySet<string>;
  readonly limit: number | null;
}

/**
 * Quem recebe o disparo: um número = uma mensagem.
 *
 * O mesmo WhatsApp aparece em mais de um lead — a empresa da lista da Receita
 * e o contato avulso da mesma pessoa vindo de uma lista de telefone. Sem esta
 * deduplicação a pessoa receberia a campanha duas vezes.
 *
 * Ordem das regras, e ela importa:
 * 1. opt-out sai primeiro, para não gastar a vaga do número;
 * 2. número repetido sai depois — fica o primeiro candidato da lista, que vem
 *    ordenada por `id` do lead, então a escolha é estável entre execuções;
 * 3. lead que já está na campanha sai;
 * 4. só então o teto de quantidade é aplicado, sobre números únicos.
 */
export function selectRecipients<T extends RecipientCandidate>(
  candidates: readonly T[],
  options: RecipientSelectionOptions,
): RecipientSelection<T> {
  const seenPhones = new Set<string>(options.existingPhones);
  const unique: T[] = [];
  let skippedOptOut = 0;
  let skippedDuplicatePhone = 0;

  for (const candidate of candidates) {
    if (options.optedOutPhones.has(candidate.phone)) {
      skippedOptOut += 1;
      continue;
    }
    if (seenPhones.has(candidate.phone)) {
      skippedDuplicatePhone += 1;
      continue;
    }
    seenPhones.add(candidate.phone);
    unique.push(candidate);
  }

  return {
    rows: nextRecipientBatch(unique, options.existingLeadIds, options.limit),
    skippedOptOut,
    skippedDuplicatePhone,
  };
}
