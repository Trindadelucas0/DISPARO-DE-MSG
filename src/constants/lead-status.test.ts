import { describe, expect, it } from 'vitest';

import {
  KANBAN_STATUS_ORDER,
  LEAD_STATUS_ORDER,
  isKanbanVisibleStatus,
} from '@/constants/lead-status';

describe('Kanban visível só depois de contatado', () => {
  it('esconde Novo e Pronto; mantém o restante do funil', () => {
    expect(isKanbanVisibleStatus('NEW')).toBe(false);
    expect(isKanbanVisibleStatus('READY_TO_CONTACT')).toBe(false);
    expect(isKanbanVisibleStatus('CONTACTED')).toBe(true);
    expect(isKanbanVisibleStatus('QUALIFIED')).toBe(true);
    expect(isKanbanVisibleStatus('LOST')).toBe(true);
    expect(KANBAN_STATUS_ORDER).toEqual([
      'CONTACTED',
      'QUALIFIED',
      'NEGOTIATION',
      'CUSTOMER',
      'LOST',
    ]);
    expect(LEAD_STATUS_ORDER).toHaveLength(7);
    expect(KANBAN_STATUS_ORDER).not.toContain('NEW');
    expect(KANBAN_STATUS_ORDER).not.toContain('READY_TO_CONTACT');
  });
});
