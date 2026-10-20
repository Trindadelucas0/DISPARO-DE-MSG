import { describe, expect, it } from 'vitest';

import {
  cleanContactName,
  contactPhoneFields,
  fallbackContactName,
  joinDddPhone,
  looksLikeLegacyMobile,
  normalizeSourcePhone,
} from '@/lib/contact-source';

describe('normalizeSourcePhone', () => {
  it('aceita celular com nono dígito e tira o 55 do país', () => {
    expect(normalizeSourcePhone('5561982641957')).toEqual({
      kind: 'mobile',
      digits: '61982641957',
      reason: null,
    });
  });

  it('aceita celular sem o 55 na frente', () => {
    expect(normalizeSourcePhone('51993488213')).toMatchObject({
      kind: 'mobile',
      digits: '51993488213',
    });
  });

  it('trata DDD + 8 dígitos como fixo, mesmo começando em 9', () => {
    // 61 9251-1651: formato de celular ANTES do nono dígito. Entra como fixo,
    // fica fora de campanha e não é "corrigido".
    expect(normalizeSourcePhone('556192511651')).toMatchObject({
      kind: 'landline',
      digits: '6192511651',
    });
  });

  it('aceita fixo de verdade', () => {
    expect(normalizeSourcePhone('556133632593')).toMatchObject({
      kind: 'landline',
      digits: '6133632593',
    });
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
    const result = normalizeSourcePhone('6150323903');
    expect(normalizeSourcePhone('14503239030').kind).toBe('invalid');
    expect(result.kind).toBe('landline');
  });

  it('rejeita valor truncado e vazio', () => {
    expect(normalizeSourcePhone('55619').kind).toBe('invalid');
    expect(normalizeSourcePhone('').reason).toBe('sem dígitos');
    expect(normalizeSourcePhone(null).reason).toBe('sem dígitos');
  });

  it('não inventa nono dígito: fixo nunca virá celular', () => {
    const result = normalizeSourcePhone('6192511651');
    expect(result.kind).toBe('landline');
    expect(result.digits).toBe('6192511651');
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

describe('looksLikeLegacyMobile', () => {
  it('marca fixo de 10 dígitos começando em 9', () => {
    expect(looksLikeLegacyMobile('6192511651')).toBe(true);
  });

  it('não marca fixo comum nem celular atual', () => {
    expect(looksLikeLegacyMobile('6133632593')).toBe(false);
    expect(looksLikeLegacyMobile('61982641957')).toBe(false);
  });
});

describe('contactPhoneFields', () => {
  it('celular vai para whatsapp e telefone', () => {
    expect(contactPhoneFields({ kind: 'mobile', digits: '61982641957', reason: null })).toEqual({
      whatsapp: '61982641957',
      telefone: '61982641957',
      phones: ['61982641957'],
    });
  });

  it('fixo NÃO vai para whatsapp', () => {
    expect(contactPhoneFields({ kind: 'landline', digits: '6133632593', reason: null })).toEqual({
      whatsapp: null,
      telefone: '6133632593',
      phones: ['6133632593'],
    });
  });

  it('inválido não grava telefone nenhum', () => {
    expect(contactPhoneFields({ kind: 'invalid', digits: null, reason: 'x' })).toEqual({
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
