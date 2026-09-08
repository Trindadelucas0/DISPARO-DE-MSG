import { describe, expect, it } from 'vitest';

import { formatCnpj, isValidCnpj } from '@/lib/validation/cnpj';
import { parsePhone } from '@/lib/validation/phone';
import { manualContactCnpj, manualContactPhoneFields } from '@/lib/manual-contact';

describe('contato manual', () => {
  it('gera chave de 14 dígitos que não é CNPJ válido', () => {
    const key = manualContactCnpj('38998100827');
    expect(key).toHaveLength(14);
    expect(/^\d{14}$/.test(key)).toBe(true);
    expect(isValidCnpj(key)).toBe(false);
    expect(formatCnpj(key)).toBe('—');
  });

  it('é estável para o mesmo telefone', () => {
    expect(manualContactCnpj('38998100827')).toBe(manualContactCnpj('55 38 99810-0827'));
  });

  it('grava o número como telefone e como WhatsApp', () => {
    const mobile = parsePhone('38998100827');
    expect(manualContactPhoneFields(mobile)).toEqual({
      whatsapp: '38998100827',
      telefone: '38998100827',
      phones: ['38998100827'],
    });
    const landline = parsePhone('6134871776');
    expect(landline?.isMobile).toBe(false);
    expect(manualContactPhoneFields(landline)).toEqual({
      whatsapp: '6134871776',
      telefone: '6134871776',
      phones: ['6134871776'],
    });
    expect(manualContactPhoneFields(null)).toEqual({
      whatsapp: null,
      telefone: null,
      phones: [],
    });
  });
});
