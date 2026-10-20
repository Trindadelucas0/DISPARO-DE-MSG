import type { AutoReplyMatchMode } from '@prisma/client';

export function normalizeAutoReplyText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchesAutoReplyRule(
  message: string,
  mode: AutoReplyMatchMode,
  values: readonly string[],
): boolean {
  const normalized = normalizeAutoReplyText(message);
  const options = values.map(normalizeAutoReplyText);
  if (mode === 'CONTAINS') return normalized.includes(options[0] ?? '');
  return options.includes(normalized);
}
