import { describe, expect, it } from 'vitest';

import { compareContactPriority, contactBucket } from '@/lib/priority';

const now = new Date('2026-08-30T15:00:00');

describe('priority queue', () => {
  it('classifica atrasado, hoje, novo e futuro', () => {
    expect(
      contactBucket(
        { lastContactAt: null, nextContactAt: '2026-08-29T12:00:00', createdAt: '2026-08-01' },
        now,
      ),
    ).toBe('overdue');
    expect(
      contactBucket(
        { lastContactAt: null, nextContactAt: '2026-08-30T18:00:00', createdAt: '2026-08-01' },
        now,
      ),
    ).toBe('today');
    expect(
      contactBucket({ lastContactAt: null, nextContactAt: null, createdAt: '2026-08-01' }, now),
    ).toBe('new');
    expect(
      contactBucket(
        { lastContactAt: '2026-08-20', nextContactAt: '2026-09-02', createdAt: '2026-08-01' },
        now,
      ),
    ).toBe('future');
  });

  it('ordena atrasado antes de hoje, novo e futuro', () => {
    const overdue = {
      lastContactAt: null,
      nextContactAt: '2026-08-20',
      createdAt: '2026-08-01',
    };
    const today = {
      lastContactAt: null,
      nextContactAt: '2026-08-30T10:00:00',
      createdAt: '2026-08-01',
    };
    const fresh = { lastContactAt: null, nextContactAt: null, createdAt: '2026-08-28' };
    const future = {
      lastContactAt: '2026-08-20',
      nextContactAt: '2026-09-10',
      createdAt: '2026-08-01',
    };

    const ranked = [future, fresh, overdue, today].sort((a, b) =>
      compareContactPriority(a, b, now),
    );
    expect(ranked.map((item) => contactBucket(item, now))).toEqual([
      'overdue',
      'today',
      'new',
      'future',
    ]);
  });
});
