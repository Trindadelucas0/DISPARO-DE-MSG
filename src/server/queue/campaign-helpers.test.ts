import { describe, expect, it } from 'vitest';

import { nextRecipientBatch, takeRecipientLimit } from '@/server/queue/campaign-helpers';

describe('próximo lote de campanha', () => {
  const rows = [{ leadId: 'a' }, { leadId: 'b' }, { leadId: 'c' }, { leadId: 'd' }];

  it('takeRecipientLimit corta os primeiros N', () => {
    expect(takeRecipientLimit(rows, 2).map((row) => row.leadId)).toEqual(['a', 'b']);
    expect(takeRecipientLimit(rows, null)).toHaveLength(4);
  });

  it('não pega leadId já materializado nesta campanha', () => {
    const next = nextRecipientBatch(rows, new Set(['a', 'b']), 2);
    expect(next.map((row) => row.leadId)).toEqual(['c', 'd']);
  });

  it('se o lote pede 100 e só restam 2, devolve os 2 restantes', () => {
    const next = nextRecipientBatch(rows, new Set(['a', 'b']), 100);
    expect(next.map((row) => row.leadId)).toEqual(['c', 'd']);
  });

  it('lote vazio quando todo o público já está na campanha', () => {
    expect(nextRecipientBatch(rows, new Set(['a', 'b', 'c', 'd']), 100)).toEqual([]);
  });
});
