import { describe, expect, it } from 'vitest';

import { detectColumns } from '@/server/services/import/columns';
import { normalizeRow, parseDate, parseSimNao } from '@/server/services/import/normalize';

describe('import normalize', () => {
  it('parseia datas da planilha em UTC', () => {
    expect(parseDate('2020-03-15')?.toISOString()).toBe('2020-03-15T00:00:00.000Z');
    expect(parseDate('15/03/2020')?.toISOString()).toBe('2020-03-15T00:00:00.000Z');
    expect(parseDate('nao-e-data')).toBeNull();
  });

  it('parseia Sim/Não', () => {
    expect(parseSimNao('Sim')).toBe(true);
    expect(parseSimNao('não')).toBe(false);
    expect(parseSimNao('')).toBe(false);
  });

  it('normaliza pessoa física com CPF para uma chave interna não exibida como CNPJ', () => {
    const headers = ['Tipo', 'Nome/Razão social', 'Documento', 'CNPJ', 'Telefone/Celular'];
    const detection = detectColumns(headers);
    const result = normalizeRow(
      ['PF', 'Maria da Silva', '529.982.247-25', '------', '(61) 99999-0000'],
      {
        mapping: detection.mapping,
        headers,
        unmappedIndexes: [],
        origem: 'clientes.xlsx',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.cnpj).toHaveLength(14);
    expect(result.lead.cnpj).toMatch(/^99/);
    expect(result.lead.rawImport).toMatchObject({
      Tipo: 'PF',
      Documento: '529.982.247-25',
    });
  });
});
