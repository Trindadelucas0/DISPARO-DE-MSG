import { describe, expect, it } from 'vitest';

import { supervisionSellersWhere } from '@/lib/supervision';

describe('supervisionSellersWhere', () => {
  it('não filtra por papel — ADMIN com conversa assumida precisa aparecer', () => {
    const where = supervisionSellersWhere();
    expect(JSON.stringify(where)).not.toMatch(/role|USER|MANAGER|ADMIN/);
    expect(where).toEqual({
      OR: [{ active: true }, { conversationsAssigned: { some: {} } }],
    });
  });
});
