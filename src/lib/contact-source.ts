import { onlyDigits } from '@/lib/validation/cnpj';
import { isValidDdd, nationalPhoneDigits, parsePhone } from '@/lib/validation/phone';

/**
 * Normalização dos pacotes de telefone vindos de fora do CRM (lista de
 * empresas e listas auxiliares sem CNPJ).
 *
 * Duas regras valem para todo o pacote:
 * - só celular válido (DDD + nono dígito) é tratado como WhatsApp; fixo fica
 *   em `telefone` e não entra em público de campanha;
 * - número fora do padrão é REJEITADO e relatado, nunca "corrigido" por
 *   adivinhação (não inventamos o nono dígito nem trocamos DDD).
 */

export type SourcePhoneKind = 'mobile' | 'landline' | 'invalid';

export interface SourcePhone {
  readonly kind: SourcePhoneKind;
  /** DDD + número, sem o 55 do país. `null` quando inválido. */
  readonly digits: string | null;
  /** Motivo da rejeição, só quando `kind` é `invalid`. */
  readonly reason: string | null;
}

const INVALID = (reason: string): SourcePhone => ({ kind: 'invalid', digits: null, reason });

/**
 * Classifica um telefone cru da fonte.
 *
 * As fontes trazem `556192511651` (com 55), `51993488213` (sem 55),
 * `447710173736` (outro país) e valores truncados como `55619`.
 */
export function normalizeSourcePhone(raw: string | null | undefined): SourcePhone {
  const all = onlyDigits(String(raw ?? ''));
  if (all.length === 0) return INVALID('sem dígitos');

  const digits = nationalPhoneDigits(raw);

  if (digits.length < 10) {
    return INVALID(`${digits.length} dígitos: curto para DDD + número`);
  }
  if (digits.length > 11) {
    return INVALID(`${digits.length} dígitos: fora do padrão brasileiro`);
  }

  const ddd = digits.slice(0, 2);
  if (!isValidDdd(ddd)) return INVALID(`DDD ${ddd} não existe no Brasil`);

  const parsed = parsePhone(digits);
  if (!parsed) {
    // 11 dígitos com DDD válido só falha quando o número não começa em 9.
    return INVALID('onze dígitos sem o nono dígito 9');
  }

  return { kind: parsed.isMobile ? 'mobile' : 'landline', digits: parsed.digits, reason: null };
}

/**
 * Fixo de 10 dígitos cujo número começa em 9: formato de celular brasileiro
 * ANTES da migração para o nono dígito (ex.: 61 9251-1651).
 *
 * Serve só para RELATAR o tamanho do problema. Não vira WhatsApp: acrescentar
 * o 9 seria adivinhar que o número é celular e que continua ativo, e nenhuma
 * das duas coisas está no dado.
 */
export function looksLikeLegacyMobile(digits: string | null | undefined): boolean {
  const value = onlyDigits(String(digits ?? ''));
  return value.length === 10 && value[2] === '9';
}

/** `DDD1` + `Telefone1` da lista empresarial em um número só. */
export function joinDddPhone(
  ddd: string | null | undefined,
  number: string | null | undefined,
): string {
  const dddDigits = onlyDigits(String(ddd ?? ''));
  const numberDigits = onlyDigits(String(number ?? ''));
  if (numberDigits.length === 0) return '';
  // O número já pode vir com o DDD embutido; não duplicar.
  if (dddDigits.length === 0 || numberDigits.startsWith(dddDigits)) return numberDigits;
  return `${dddDigits}${numberDigits}`;
}

/** Nome de exibição para contato sem nome na fonte. */
export function fallbackContactName(digits: string | null | undefined): string {
  const tail = onlyDigits(String(digits ?? '')).slice(-4);
  return tail.length === 4 ? `Contato importado • final ${tail}` : 'Contato importado';
}

/**
 * Nome do contato como vem da fonte: espaços colapsados, sem o resto.
 * Não tenta corrigir caixa nem acento — o dado é de terceiro.
 */
export function cleanContactName(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (trimmed.length === 0) return null;
  // Célula que repete o próprio telefone não é nome.
  if (onlyDigits(trimmed).length === trimmed.replace(/[\s()+-]/g, '').length) return null;
  return trimmed.slice(0, 200);
}

/**
 * Campos de contato de um lead criado a partir de um número avulso.
 * Fixo NUNCA vai para `whatsapp`: campanha lê `whatsapp`.
 */
export function contactPhoneFields(phone: SourcePhone): {
  readonly whatsapp: string | null;
  readonly telefone: string | null;
  readonly phones: string[];
} {
  if (phone.kind === 'invalid' || !phone.digits) {
    return { whatsapp: null, telefone: null, phones: [] };
  }
  return {
    whatsapp: phone.kind === 'mobile' ? phone.digits : null,
    telefone: phone.digits,
    phones: [phone.digits],
  };
}
