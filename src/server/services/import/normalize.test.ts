import { describe, expect, it } from 'vitest';

import { parseDate, parseSimNao } from '@/server/services/import/normalize';

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
});
