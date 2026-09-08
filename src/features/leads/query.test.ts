import { describe, expect, it } from 'vitest';

import { defaultLeadFilters } from '@/features/leads/filter-model';
import { leadsApiUrl } from '@/features/leads/query';

describe('palette query', () => {
  it('leadsApiUrl com search e limit=8 contém esses params', () => {
    const url = leadsApiUrl({
      ...defaultLeadFilters(),
      search: 'acme',
      limit: 8,
      page: 1,
    });
    expect(url).toContain('search=acme');
    expect(url).toContain('limit=8');
    expect(url.startsWith('/api/leads?')).toBe(true);
  });

  it('leadsApiUrl serializa campaignId', () => {
    const url = leadsApiUrl({
      ...defaultLeadFilters(),
      campaignId: 'camp_1',
    });
    expect(url).toContain('campaignId=camp_1');
  });
});
