import { onlyDigits } from './cnpj';

/**
 * Telefones brasileiros como vêm na planilha: string separada por vírgula no
 * formato `DDD-numero` (ex.: `61-34871776,11-999998888`).
 *
 * Regras:
 * - fixo: DDD (2) + 8 dígitos;
 * - celular: DDD (2) + 9 dígitos começando em 9.
 * Na planilha, `whatsapp` é o primeiro celular. Contato da Inbox/manual grava o
 * mesmo número em `whatsapp` e `telefone`. `toWhatsappNumber` aceita os dois
 * formatos para JID/wa.me.
 */

const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export interface ParsedPhone {
  /** Somente dígitos, com DDD: 10 (fixo) ou 11 (celular). */
  readonly digits: string;
  readonly ddd: string;
  readonly number: string;
  readonly isMobile: boolean;
}

/** DDD+número nacional. Remove o 55 do país se vier no começo. */
export function nationalPhoneDigits(raw: string | null | undefined): string {
  const digits = onlyDigits(String(raw ?? ''));
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
  return digits;
}

export function parsePhone(raw: string | null | undefined): ParsedPhone | null {
  if (!raw) return null;
  const digits = nationalPhoneDigits(raw);
  if (digits.length < 10 || digits.length > 11) return null;

  const ddd = digits.slice(0, 2);
  if (!VALID_DDD.has(Number(ddd))) return null;

  const number = digits.slice(2);
  const isMobile = number.length === 9 && number.startsWith('9');
  const isLandline = number.length === 8;
  if (!isMobile && !isLandline) return null;

  return { digits, ddd, number, isMobile };
}

/** Divide a coluna `Telefones` em telefones válidos, na ordem original, sem repetição. */
export function parsePhoneList(raw: string | null | undefined): ParsedPhone[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: ParsedPhone[] = [];

  for (const chunk of String(raw).split(/[,;/]/)) {
    const parsed = parsePhone(chunk);
    if (parsed && !seen.has(parsed.digits)) {
      seen.add(parsed.digits);
      result.push(parsed);
    }
  }

  return result;
}

export function firstMobile(phones: readonly ParsedPhone[]): ParsedPhone | null {
  return phones.find((phone) => phone.isMobile) ?? null;
}

/** (61) 3487-1776 / (11) 99999-8888 — só para exibição. */
export function formatPhone(value: string | null | undefined): string {
  const parsed = parsePhone(value);
  if (!parsed) return value ?? '';
  const { ddd, number } = parsed;
  const split = number.length === 9 ? 5 : 4;
  return `(${ddd}) ${number.slice(0, split)}-${number.slice(split)}`;
}

/** Número no formato exigido pelo wa.me: 55 + DDD + número (celular ou fixo já usado no WhatsApp). */
export function toWhatsappNumber(value: string | null | undefined): string | null {
  const parsed = parsePhone(value);
  if (!parsed) return null;
  return `55${parsed.digits}`;
}
