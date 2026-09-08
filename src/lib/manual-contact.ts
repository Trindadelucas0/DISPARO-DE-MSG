import { isValidCnpj } from '@/lib/validation/cnpj';
import { nationalPhoneDigits, type ParsedPhone } from '@/lib/validation/phone';

/**
 * Chave de 14 dígitos para contato manual sem CNPJ da Receita.
 * Nunca passa em `isValidCnpj` — a listagem mostra "—" no CNPJ.
 */
export function manualContactCnpj(phone: string | null | undefined): string {
  const trimmed = nationalPhoneDigits(phone);
  const body = (trimmed.slice(-11) || Date.now().toString().slice(-11)).padStart(11, '0');
  for (let last = 9; last >= 0; last -= 1) {
    const candidate = `00${body}${last}`;
    if (!isValidCnpj(candidate)) return candidate;
  }
  return `00${body}0`;
}

/**
 * Contato da Inbox / cadastro manual: o número entra nos dois campos.
 * Campanha e filtro "Com celular" leem `whatsapp`; a coluna Telefone lê `telefone`.
 */
export function manualContactPhoneFields(parsed: ParsedPhone | null): {
  readonly whatsapp: string | null;
  readonly telefone: string | null;
  readonly phones: string[];
} {
  if (!parsed) return { whatsapp: null, telefone: null, phones: [] };
  return {
    whatsapp: parsed.digits,
    telefone: parsed.digits,
    phones: [parsed.digits],
  };
}
