import { describe, expect, it } from 'vitest';
import { matchesAutoReplyRule, normalizeAutoReplyText } from '@/lib/auto-reply';

describe('campaign auto reply matcher', () => {
  it('normaliza caixa, acentos e espaços', () => {
    expect(normalizeAutoReplyText('  TÊNHO   Interesse ')).toBe('tenho interesse');
  });
  it('compara resposta exata', () => {
    expect(matchesAutoReplyRule(' 2 ', 'EQUALS', ['2'])).toBe(true);
    expect(matchesAutoReplyRule('opção 2', 'EQUALS', ['2'])).toBe(false);
  });
  it('encontra texto contido', () => {
    expect(matchesAutoReplyRule('Tenho INTERESSE agora', 'CONTAINS', ['interesse'])).toBe(true);
  });
  it('aceita uma das alternativas', () => {
    expect(matchesAutoReplyRule('Pode enviar', 'ANY_OF', ['sim', 'pode enviar'])).toBe(true);
  });
});
