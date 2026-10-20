import { describe, expect, it } from 'vitest';

import {
  cleanContactName,
  contactPhoneFields,
  downgradeToLegacyMobile,
  fallbackContactName,
  joinDddPhone,
  looksLikeLegacyMobile,
  normalizeSourcePhone,
  phoneLookupVariants,
  upgradeLegacyMobile,
} from '@/lib/contact-source';

describe('normalizeSourcePhone', () => {
  it('aceita celular com nono dígito e tira o 55 do país', () => {
    expect(normalizeSourcePhone('5561982641957')).toEqual({
      kind: 'mobile',
      digits: '61982641957',
      reason: null,
      legacyUpgraded: false,
    });
  });

  it('aceita celular sem o 55 na frente', () => {
    expect(normalizeSourcePhone('51993488213')).toMatchObject({
      kind: 'mobile',
      digits: '51993488213',
    });
  });

  it('converte celular de 8 dígitos para o formato atual', () => {
    // 61 9251-1651 é celular anterior à migração da Anatel: vira 61 99251-1651.
    expect(normalizeSourcePhone('556192511651')).toEqual({
      kind: 'mobile',
      digits: '61992511651',
      reason: null,
      legacyUpgraded: true,
    });
  });

  it('converte os quatro prefixos de celular antigo (6, 7, 8 e 9)', () => {
    expect(normalizeSourcePhone('556182245415')).toMatchObject({
      kind: 'mobile',
      digits: '61982245415',
      legacyUpgraded: true,
    });
    expect(normalizeSourcePhone('556172245415')).toMatchObject({ kind: 'mobile' });
    expect(normalizeSourcePhone('556162245415')).toMatchObject({ kind: 'mobile' });
  });

  it('fixo de verdade (2, 3, 4, 5) continua fixo', () => {
    for (const phone of ['6133632593', '6123456789', '6143632593', '6153632593']) {
      const result = normalizeSourcePhone(phone);
      expect(result.kind).toBe('landline');
      expect(result.digits).toBe(phone);
      expect(result.legacyUpgraded).toBe(false);
    }
  });

  it('rejeita número de outro país', () => {
    expect(normalizeSourcePhone('447710173736').kind).toBe('invalid');
    expect(normalizeSourcePhone('5491169823821').kind).toBe('invalid');
  });

  it('rejeita DDD inexistente e diz qual', () => {
    const result = normalizeSourcePhone('558092160820');
    expect(result.kind).toBe('invalid');
    expect(result.reason).toContain('DDD 80');
  });

  it('rejeita onze dígitos sem o nono dígito 9', () => {
    expect(normalizeSourcePhone('14503239030').kind).toBe('invalid');
  });

  it('rejeita valor truncado e vazio', () => {
    expect(normalizeSourcePhone('55619').kind).toBe('invalid');
    expect(normalizeSourcePhone('').reason).toBe('sem dígitos');
    expect(normalizeSourcePhone(null).reason).toBe('sem dígitos');
  });

  it('não remenda o que não dá para classificar', () => {
    // Trunca, DDD inexistente e número de fora continuam rejeitados: a
    // conversão do nono dígito vale só para celular brasileiro reconhecível.
    for (const phone of ['55619', '558092160820', '447710173736']) {
      expect(normalizeSourcePhone(phone).digits).toBeNull();
    }
  });
});

describe('upgradeLegacyMobile', () => {
  it('põe o nono dígito no celular de 8 dígitos', () => {
    expect(upgradeLegacyMobile('6192511651')).toBe('61992511651');
    expect(upgradeLegacyMobile('6182245415')).toBe('61982245415');
  });

  it('não mexe em fixo nem em celular que já está no formato atual', () => {
    expect(upgradeLegacyMobile('6133632593')).toBeNull();
    expect(upgradeLegacyMobile('61982641957')).toBeNull();
    expect(upgradeLegacyMobile('')).toBeNull();
  });
});

describe('downgradeToLegacyMobile', () => {
  it('volta ao formato de 8 dígitos', () => {
    expect(downgradeToLegacyMobile('61992511651')).toBe('6192511651');
  });

  it('não devolve número que não era celular antigo', () => {
    expect(downgradeToLegacyMobile('6133632593')).toBeNull();
    expect(downgradeToLegacyMobile('61912345678')).toBeNull();
  });
});

describe('phoneLookupVariants', () => {
  it('procura o celular nas duas formas, atual e antiga', () => {
    expect(phoneLookupVariants('61992511651')).toEqual(['61992511651', '6192511651']);
    expect(phoneLookupVariants('6192511651')).toEqual(['6192511651', '61992511651']);
  });

  it('fixo tem uma forma só', () => {
    expect(phoneLookupVariants('6133632593')).toEqual(['6133632593']);
  });

  it('vazio não procura nada', () => {
    expect(phoneLookupVariants('')).toEqual([]);
  });
});

describe('looksLikeLegacyMobile', () => {
  it('marca celular ainda no formato de 8 dígitos', () => {
    expect(looksLikeLegacyMobile('6192511651')).toBe(true);
  });

  it('não marca fixo nem celular atual', () => {
    expect(looksLikeLegacyMobile('6133632593')).toBe(false);
    expect(looksLikeLegacyMobile('61982641957')).toBe(false);
  });
});

describe('joinDddPhone', () => {
  it('junta DDD e número das colunas separadas', () => {
    expect(joinDddPhone('61', '33632593')).toBe('6133632593');
  });

  it('não duplica o DDD quando o número já o traz', () => {
    expect(joinDddPhone('61', '6133632593')).toBe('6133632593');
  });

  it('devolve vazio sem número', () => {
    expect(joinDddPhone('61', '')).toBe('');
    expect(joinDddPhone('', '')).toBe('');
  });

  it('aceita número sem DDD informado', () => {
    expect(joinDddPhone('', '33632593')).toBe('33632593');
  });
});

describe('contactPhoneFields', () => {
  it('celular vai para whatsapp e telefone', () => {
    expect(contactPhoneFields({ kind: 'mobile', digits: '61982641957' })).toEqual({
      whatsapp: '61982641957',
      telefone: '61982641957',
      phones: ['61982641957'],
    });
  });

  it('fixo NÃO vai para whatsapp', () => {
    expect(contactPhoneFields({ kind: 'landline', digits: '6133632593' })).toEqual({
      whatsapp: null,
      telefone: '6133632593',
      phones: ['6133632593'],
    });
  });

  it('inválido não grava telefone nenhum', () => {
    expect(contactPhoneFields({ kind: 'invalid', digits: null })).toEqual({
      whatsapp: null,
      telefone: null,
      phones: [],
    });
  });
});

describe('cleanContactName', () => {
  it('colapsa espaço e corta vazio', () => {
    expect(cleanContactName('  Welker   Ferreira ')).toBe('Welker Ferreira');
    expect(cleanContactName('   ')).toBeNull();
    expect(cleanContactName(null)).toBeNull();
  });

  it('não aceita o próprio telefone como nome', () => {
    expect(cleanContactName('556192511651')).toBeNull();
    expect(cleanContactName('(61) 9251-1651')).toBeNull();
  });
});

describe('fallbackContactName', () => {
  it('usa o final de quatro dígitos', () => {
    expect(fallbackContactName('61982641957')).toBe('Contato importado • final 1957');
  });

  it('sem dígitos suficientes fica sem o final', () => {
    expect(fallbackContactName('12')).toBe('Contato importado');
  });
});
