/** CNPJ: normalização e dígito verificador. Sem dependência externa. */

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

export function normalizeCnpj(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = onlyDigits(String(value));
  return digits.length === 14 ? digits : null;
}

const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

function checkDigit(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * (weights[i] as number);
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Valida os 14 dígitos e os dois dígitos verificadores. */
export function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = normalizeCnpj(value);
  if (!cnpj) return false;
  // Todos os dígitos iguais passam na conta mas não existem na Receita.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const first = checkDigit(cnpj.slice(0, 12), FIRST_WEIGHTS);
  if (first !== Number(cnpj[12])) return false;

  const second = checkDigit(cnpj.slice(0, 13), SECOND_WEIGHTS);
  return second === Number(cnpj[13]);
}

/** 00.000.000/0000-00 — só para exibição. O banco guarda apenas dígitos. */
export function formatCnpj(value: string | null | undefined): string {
  const cnpj = normalizeCnpj(value);
  if (!cnpj) return value ?? '';
  if (!isValidCnpj(cnpj)) return '—';
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
