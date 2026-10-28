import { describe, expect, it } from 'vitest';

import {
  buildVCardFile,
  contactDisplayName,
  groupLabel,
  splitIntoGroups,
  toE164,
  toVCard,
} from '@/lib/contacts/vcard';

describe('rótulo do grupo', () => {
  it('vai de A a Z e recomeça numerado', () => {
    expect(groupLabel(0)).toBe('A');
    expect(groupLabel(25)).toBe('Z');
    expect(groupLabel(26)).toBe('A1');
    expect(groupLabel(31)).toBe('F1');
    expect(groupLabel(51)).toBe('Z1');
    expect(groupLabel(52)).toBe('A2');
  });
});

describe('divisão em grupos', () => {
  it('fecha o último grupo com o que sobrou', () => {
    expect(splitIntoGroups([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitIntoGroups([], 50)).toEqual([]);
  });

  it('recusa tamanho inválido', () => {
    expect(() => splitIntoGroups([1], 0)).toThrow();
  });
});

describe('nome na agenda', () => {
  it('põe o rótulo na frente para o celular ordenar junto', () => {
    expect(contactDisplayName('A', 1, 'Francoise Batista', 50)).toBe('A01 Francoise Batista');
    expect(contactDisplayName('A', 50, 'Francoise Batista', 50)).toBe('A50 Francoise Batista');
    expect(contactDisplayName('B1', 7, 'J R Botelho', 100)).toBe('B1007 J R Botelho');
  });

  it('limpa espaço repetido e corta nome quilométrico', () => {
    expect(contactDisplayName('A', 2, '  Dois   espaços  ', 50)).toBe('A02 Dois espaços');
    expect(contactDisplayName('A', 3, 'x'.repeat(80), 50)).toBe(`A03 ${'x'.repeat(60)}`);
  });
});

describe('vCard', () => {
  it('escapa separador e usa CRLF', () => {
    const vcard = toVCard({
      displayName: 'A01 Empresa, Ltda; Filial',
      phone: '+5562999999999',
      organization: 'Empresa, Ltda',
    });
    expect(vcard).toContain('FN:A01 Empresa\\, Ltda\\; Filial');
    expect(vcard).toContain('ORG:Empresa\\, Ltda');
    expect(vcard).toContain('TEL;TYPE=CELL:+5562999999999');
    expect(vcard.split('\r\n')[0]).toBe('BEGIN:VCARD');
    expect(vcard.endsWith('END:VCARD')).toBe(true);
  });

  it('junta vários contatos em um arquivo só', () => {
    const arquivo = buildVCardFile([
      { displayName: 'A01 Um', phone: '+5562900000001' },
      { displayName: 'A02 Dois', phone: '+5562900000002' },
    ]);
    expect(arquivo.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(arquivo.endsWith('END:VCARD\r\n')).toBe(true);
  });

  it('completa o + do E.164 sem duplicar', () => {
    expect(toE164('5562999999999')).toBe('+5562999999999');
    expect(toE164('+5562999999999')).toBe('+5562999999999');
  });
});
