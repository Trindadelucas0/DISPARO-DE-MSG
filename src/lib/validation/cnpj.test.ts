import { describe, expect, it } from 'vitest';

import { formatCnpj, isValidCnpj, normalizeCnpj } from '@/lib/validation/cnpj';

describe('cnpj', () => {
  it('aceita CNPJ com dígito verificador correto', () => {
    expect(isValidCnpj('33.000.167/0001-01')).toBe(true);
    expect(normalizeCnpj('33000167000101')).toBe('33000167000101');
    expect(formatCnpj('33000167000101')).toBe('33.000.167/0001-01');
  });

  it('rejeita tamanho errado, repetição e DV inválido', () => {
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('33000167000100')).toBe(false);
  });
});
