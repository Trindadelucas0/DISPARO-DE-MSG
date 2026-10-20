import { describe, expect, it } from 'vitest';

import { manualContactCnpj } from '@/lib/manual-contact';
import { isValidCnpj } from '@/lib/validation/cnpj';
import { pickPhoneAndNameColumns } from '@/server/services/contact-import.service';

describe('pickPhoneAndNameColumns', () => {
  it('acha o telefone na segunda coluna e o nome na primeira', () => {
    expect(
      pickPhoneAndNameColumns([
        ['pamela sousa', '556191995216', '', ''],
        ['', '556185327075', '', ''],
        ['Welison Silva', '556193478519', '', ''],
      ]),
    ).toEqual({ phoneColumn: 1, nameColumn: 0 });
  });

  it('arquivo só de números não tem coluna de nome', () => {
    expect(
      pickPhoneAndNameColumns([
        ['', '556192511651'],
        ['', '556192513777'],
      ]),
    ).toEqual({ phoneColumn: 1, nameColumn: null });
  });

  it('acha o telefone na primeira coluna quando é lá que ele está', () => {
    expect(
      pickPhoneAndNameColumns([
        ['556192511651', 'Ana'],
        ['556192513777', 'Bruno'],
      ]),
    ).toEqual({ phoneColumn: 0, nameColumn: 1 });
  });
});

describe('CNPJ técnico do contato sem CNPJ', () => {
  it('é estável para o mesmo número — é isso que torna a carga idempotente', () => {
    expect(manualContactCnpj('61982641957')).toBe(manualContactCnpj('61982641957'));
  });

  it('nunca passa por CNPJ de verdade', () => {
    for (const phone of ['61982641957', '6133632593', '11999998888', '6192511651']) {
      expect(isValidCnpj(manualContactCnpj(phone))).toBe(false);
    }
  });

  it('números diferentes geram chaves diferentes', () => {
    const keys = new Set(
      ['61982641957', '6133632593', '11999998888', '6192511651', '6192513777'].map((phone) =>
        manualContactCnpj(phone),
      ),
    );
    expect(keys.size).toBe(5);
  });

  it('celular e fixo do mesmo DDD não colidem', () => {
    expect(manualContactCnpj('61982641957')).not.toBe(manualContactCnpj('6198264195'));
  });
});
