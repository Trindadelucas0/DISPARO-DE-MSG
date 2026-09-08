import { describe, expect, it } from 'vitest';

import { chipsFromFilters, defaultLeadFilters } from '@/features/leads/filter-model';
import { filtersToSearchParams } from '@/features/leads/query';
import {
  countActiveFilters,
  leadFiltersSchema,
  MAX_FILTER_LEAD_IDS,
  mergeLeadIds,
  parseLeadIds,
} from '@/features/leads/schema';

describe('ids de destinatários escolhidos', () => {
  it('parseia lista CSV, array e ignora vazio', () => {
    expect(parseLeadIds('a,b,a')).toEqual(['a', 'b']);
    expect(parseLeadIds(['x', ' y ', 'x'])).toEqual(['x', 'y']);
    expect(parseLeadIds('')).toBeUndefined();
    expect(parseLeadIds([])).toBeUndefined();
  });

  it('corta no teto de 500', () => {
    const overflow = Array.from({ length: MAX_FILTER_LEAD_IDS + 20 }, (_, index) => `id${index}`);
    expect(parseLeadIds(overflow)).toHaveLength(MAX_FILTER_LEAD_IDS);
  });

  it('leadFiltersSchema aceita ids na querystring e no JSON', () => {
    expect(leadFiltersSchema.parse({ ids: 'c1,c2' }).ids).toEqual(['c1', 'c2']);
    expect(leadFiltersSchema.parse({ ids: ['c1', 'c2'] }).ids).toEqual(['c1', 'c2']);
    expect(leadFiltersSchema.parse({}).ids).toBeUndefined();
  });

  it('mergeLeadIds acumula sem repetir', () => {
    expect(mergeLeadIds(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('filtersToSearchParams serializa ids e o chip conta os escolhidos', () => {
    const filters = leadFiltersSchema.parse({ ids: ['c1', 'c2'] });
    expect(filtersToSearchParams(filters).get('ids')).toBe('c1,c2');
    expect(countActiveFilters(filters)).toBe(1);
    expect(chipsFromFilters(filters).map((chip) => chip.key)).toContain('ids');
    expect(chipsFromFilters(defaultLeadFilters())).toEqual([]);
  });
});
