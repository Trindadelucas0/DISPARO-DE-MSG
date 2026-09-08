import { describe, expect, it } from 'vitest';

import { extractTemplateVariables, renderTemplate } from '@/lib/template';

describe('template', () => {
  it('extrai variáveis sem repetir', () => {
    const names = extractTemplateVariables('Olá {{razaoSocial}} de {{cidade}}/{{estado}}. {{razaoSocial}}?');
    expect(names).toEqual(['razaoSocial', 'cidade', 'estado']);
  });

  it('substitui variável presente e esvazia ausente', () => {
    const text = renderTemplate('Oi {{vendedor}}, falo da {{razaoSocial}} em {{cidade}}.', {
      vendedor: 'Ana',
      razaoSocial: 'Acme Ltda',
    });
    expect(text).toBe('Oi Ana, falo da Acme Ltda em .');
  });

  it('conhece variáveis novas da campanha', () => {
    const text = renderTemplate('{{empresa}} / {{pais}} / {{segmento}}', {
      empresa: 'Acme',
      pais: 'Brasil',
      segmento: 'Eventos',
    });
    expect(text).toBe('Acme / Brasil / Eventos');
  });
});
