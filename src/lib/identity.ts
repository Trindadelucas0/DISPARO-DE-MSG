/**
 * Identidade visual de um registro (empresa / usuário).
 * Matiz estável por hash — não usa tokens de funil nem de resultado.
 */

export const IDENTITY_SLOT_COUNT = 6;

export type IdentitySlot = 0 | 1 | 2 | 3 | 4 | 5;

/** Dígitos de CNPJ se o seed parecer um; senão o texto cru. Mesmo CNPJ → mesmo slot. */
export function identitySeed(seed: string): string {
  const digits = seed.replace(/\D+/g, '');
  return digits.length === 14 ? digits : seed;
}

export function identitySlot(seed: string): IdentitySlot {
  const normalized = identitySeed(seed);
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (Math.imul(hash, 31) + normalized.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % IDENTITY_SLOT_COUNT) as IdentitySlot;
}

export function identityCssVar(seed: string): string {
  return `var(--identity-${identitySlot(seed)})`;
}

export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) return '?';
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1];
  if (!last) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${last[0]}`.toUpperCase();
}
