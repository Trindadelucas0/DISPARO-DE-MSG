import { describe, expect, it } from 'vitest';

import { defaultLeadFilters } from '@/features/leads/filter-model';
import { buildLeadWhere } from '@/server/repositories/lead.repository';

describe('buildLeadWhere', () => {
  it('campaignId recorta destinatários da campanha', () => {
    const where = buildLeadWhere(
      { ...defaultLeadFilters(), campaignId: 'camp_1', city: 'Campinas' },
      {},
    );
    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          { campaignRecipients: { some: { campaignId: 'camp_1' } } },
          { cidade: { equals: 'Campinas', mode: 'insensitive' } },
        ]),
      }),
    );
  });

  it('sem campaignId não filtra por destinatário', () => {
    const where = buildLeadWhere(defaultLeadFilters(), {});
    expect(JSON.stringify(where)).not.toContain('campaignRecipients');
  });
});
