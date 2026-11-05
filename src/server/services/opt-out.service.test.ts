import { describe, expect, it } from 'vitest';

import { isOptOutMessage, normalizeOptOutText, withOptOutInstruction } from '@/server/services/opt-out.service';

describe('opt-out por mensagem', () => {
  it('aceita apenas comandos completos normalizados', () => {
    expect(normalizeOptOutText(' NÃO   QUERO RECEBER! ')).toBe('nao quero receber');
    expect(isOptOutMessage('SAIR')).toBe(true);
    expect(isOptOutMessage('pode parar de mandar?')).toBe(false);
  });

  it('acrescenta a saída uma única vez', () => {
    expect(withOptOutInstruction('Olá')).toContain('responda SAIR');
    expect(withOptOutInstruction('Para sair, responda SAIR')).toBe('Para sair, responda SAIR');
  });
});
