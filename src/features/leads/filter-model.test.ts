import { describe, expect, it } from 'vitest';

import {
  chipsFromFilters,
  clearFilterValue,
  defaultLeadFilters,
  setFilterValue,
} from '@/features/leads/filter-model';
import { filtersToSearchParams } from '@/features/leads/query';

describe('chip ↔ LeadFilters', () => {
  it('aplicar status, UF e hasWhatsapp gera o mesmo URLSearchParams que filtersToSearchParams', () => {
    const base = defaultLeadFilters();
    const withStatus = setFilterValue(base, { status: 'CONTACTED' });
    const withUf = setFilterValue(withStatus, { state: 'SP' });
    const applied = setFilterValue(withUf, { hasWhatsapp: true });

    const fromChips = filtersToSearchParams(applied);
    const expected = filtersToSearchParams({
      ...base,
      status: 'CONTACTED',
      state: 'SP',
      hasWhatsapp: true,
      page: 1,
    });

    expect(fromChips.toString()).toBe(expected.toString());
    expect(fromChips.get('status')).toBe('CONTACTED');
    expect(fromChips.get('state')).toBe('SP');
    expect(fromChips.get('hasWhatsapp')).toBe('true');

    const chips = chipsFromFilters(applied);
    expect(chips.map((chip) => chip.key).sort()).toEqual(
      ['hasWhatsapp', 'state', 'status'].sort(),
    );
  });

  it('remover status, UF e hasWhatsapp volta aos params sem esses campos', () => {
    const applied = setFilterValue(defaultLeadFilters(), {
      status: 'CONTACTED',
      state: 'SP',
      hasWhatsapp: true,
    });

    const withoutStatus = clearFilterValue(applied, 'status');
    const withoutUf = clearFilterValue(withoutStatus, 'state');
    const cleared = clearFilterValue(withoutUf, 'hasWhatsapp');

    const params = filtersToSearchParams(cleared);
    expect(params.get('status')).toBeNull();
    expect(params.get('state')).toBeNull();
    expect(params.get('hasWhatsapp')).toBeNull();
    expect(chipsFromFilters(cleared)).toEqual([]);
  });
});
