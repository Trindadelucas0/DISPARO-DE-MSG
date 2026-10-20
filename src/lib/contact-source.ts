import { onlyDigits } from '@/lib/validation/cnpj';
import { isValidDdd, nationalPhoneDigits, parsePhone } from '@/lib/validation/phone';

/**
 * Normalização dos pacotes de telefone vindos de fora do CRM (lista de
 * empresas e listas auxiliares sem CNPJ).
 *
 * Regras do pacote:
 * - só celular é tratado como WhatsApp; fixo fica em `telefone` e não entra em
 *   público de campanha;
 * - celular no formato ANTIGO (8 dígitos) é convertido para o formato atual —
 *   ver `MOBILE_PREFIXES` abaixo. Isso não é adivinhação: é o plano de
 *   numeração brasileiro;
 * - número fora do padrão continua REJEITADO e relatado, nunca remendado
 *   (não trocamos DDD nem completamos número truncado).
 */

/**
 * Primeiro dígito do número que, antes da migração para o nono dígito,
 * identificava CELULAR. Fixo sempre começou em 2, 3, 4 ou 5.
 *
 * A migração da Anatel foi exatamente isto: pôr um 9 na frente do número de
 * oito dígitos do celular. Por isso `61 9251-1651` vira `61 99251-1651` — o
 * número antigo não existe mais, e é o atual que está no WhatsApp.
 */
const MOBILE_PREFIXES = new Set(['6', '7', '8', '9']);

export type SourcePhoneKind = 'mobile' | 'landline' | 'invalid';

export interface SourcePhone {
  readonly kind: SourcePhoneKind;
  /** DDD + número, sem o 55 do país. `null` quando inválido. */
  readonly digits: string | null;
  /** Motivo da rejeição, só quando `kind` é `invalid`. */
  readonly reason: string | null;
  /** O número veio com 8 dígitos e ganhou o nono dígito aqui. */
  readonly legacyUpgraded: boolean;
}

const INVALID = (reason: string): SourcePhone => ({
  kind: 'invalid',
  digits: null,
  reason,
  legacyUpgraded: false,
});

/**
 * Celular de 10 dígitos (DDD + 8) no formato atual, com o nono dígito.
 * Devolve `null` quando o número não é celular antigo.
 */
export function upgradeLegacyMobile(digits: string | null | undefined): string | null {
  const value = onlyDigits(String(digits ?? ''));
  if (value.length !== 10) return null;
  const first = value[2];
  if (!first || !MOBILE_PREFIXES.has(first)) return null;
  return `${value.slice(0, 2)}9${value.slice(2)}`;
}

/** O mesmo celular no formato de 8 dígitos, como ainda aparece em base antiga. */
export function downgradeToLegacyMobile(digits: string | null | undefined): string | null {
  const value = onlyDigits(String(digits ?? ''));
  if (value.length !== 11 || value[2] !== '9') return null;
  const legacy = `${value.slice(0, 2)}${value.slice(3)}`;
  const first = legacy[2];
  if (!first || !MOBILE_PREFIXES.has(first)) return null;
  return legacy;
}

/**
 * As formas em que o MESMO celular pode estar gravado: a atual e a antiga.
 * Usada para reencontrar um lead cadastrado antes da conversão.
 */
export function phoneLookupVariants(digits: string | null | undefined): string[] {
  const value = onlyDigits(String(digits ?? ''));
  if (value.length === 0) return [];
  const twin = upgradeLegacyMobile(value) ?? downgradeToLegacyMobile(value);
  return twin ? [value, twin] : [value];
}

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

  if (parsed.isMobile) {
    return { kind: 'mobile', digits: parsed.digits, reason: null, legacyUpgraded: false };
  }

  // 10 dígitos: o primeiro dígito do número decide se era fixo ou celular.
  const upgraded = upgradeLegacyMobile(parsed.digits);
  if (upgraded) {
    return { kind: 'mobile', digits: upgraded, reason: null, legacyUpgraded: true };
  }

  return { kind: 'landline', digits: parsed.digits, reason: null, legacyUpgraded: false };
}

/** Celular ainda gravado no formato de 8 dígitos. */
export function looksLikeLegacyMobile(digits: string | null | undefined): boolean {
  return upgradeLegacyMobile(digits) !== null;
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
export function contactPhoneFields(phone: Pick<SourcePhone, 'kind' | 'digits'>): {
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
