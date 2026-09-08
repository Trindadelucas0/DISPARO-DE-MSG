import { describe, expect, it } from 'vitest';

import { findMatchingRules, pickRoundRobinUser, resolveAssignee } from '@/lib/routing';

describe('routing', () => {
  const lead = {
    estado: 'SP',
    cidade: 'Campinas',
    segmento: 'Eventos',
    porte: 'ME',
    responsavelId: 'owner-1',
  };

  it('casa regra por UF com prioridade', () => {
    const matched = findMatchingRules(
      [
        { field: 'estado', operator: 'eq', value: 'SP', userId: 'u-sp', priority: 1, active: true },
        {
          field: 'cidade',
          operator: 'eq',
          value: 'Campinas',
          userId: 'u-camp',
          priority: 10,
          active: true,
        },
      ],
      lead,
    );
    expect(matched[0]?.userId).toBe('u-camp');
  });

  it('resolve CURRENT_OWNER e respeita restrição', () => {
    const open = resolveAssignee({
      mode: 'CURRENT_OWNER',
      lead,
      rules: [],
      roundRobinUserIds: [],
      roundRobinCursor: 0,
      restrictedUserIds: [],
    });
    expect(open.userId).toBe('owner-1');

    const blocked = resolveAssignee({
      mode: 'CURRENT_OWNER',
      lead,
      rules: [],
      roundRobinUserIds: [],
      roundRobinCursor: 0,
      restrictedUserIds: ['owner-1'],
    });
    expect(blocked.userId).toBeNull();
  });

  it('round-robin avança o cursor', () => {
    const first = pickRoundRobinUser(['a', 'b', 'c'], 0);
    expect(first.userId).toBe('a');
    const second = pickRoundRobinUser(['a', 'b', 'c'], first.nextCursor);
    expect(second.userId).toBe('b');
  });

  it('MANUAL deixa sem responsável', () => {
    const result = resolveAssignee({
      mode: 'MANUAL',
      lead,
      rules: [],
      roundRobinUserIds: ['a'],
      roundRobinCursor: 0,
      restrictedUserIds: [],
    });
    expect(result.userId).toBeNull();
    expect(result.reason).toBe('UNASSIGNED');
  });
});
