import { describe, expect, it } from 'vitest';

import { Role } from '@prisma/client';

import {
  BULK_LIMIT,
  bulkAssignConfirmMessage,
  bulkLeadSchema,
  filtersForBulk,
  summarizeBulkMatch,
} from '@/features/leads/bulk-schema';
import { defaultLeadFilters } from '@/features/leads/filter-model';

function canReassign(role: Role) {
  return role === Role.ADMIN || role === Role.MANAGER;
}

describe('bulkLeadSchema', () => {
  it('aceita ids ou filters, nunca os dois', () => {
    expect(bulkLeadSchema.parse({ ids: ['a'], status: 'NEW' }).ids).toEqual(['a']);
    expect(
      bulkLeadSchema.parse({
        filters: defaultLeadFilters(),
        responsavelId: 'user-1',
      }).filters?.situacao,
    ).toBe('ATIVA');

    expect(bulkLeadSchema.safeParse({ status: 'NEW' }).success).toBe(false);
    expect(
      bulkLeadSchema.safeParse({
        ids: ['a'],
        filters: defaultLeadFilters(),
        status: 'NEW',
      }).success,
    ).toBe(false);
  });

  it('rejeita lote acima do teto e exige status ou responsável', () => {
    const overflow = Array.from({ length: BULK_LIMIT + 1 }, (_, index) => `id${index}`);
    expect(bulkLeadSchema.safeParse({ ids: overflow, status: 'NEW' }).success).toBe(false);
    expect(bulkLeadSchema.safeParse({ ids: ['a'] }).success).toBe(false);
  });

  it('USER não reatribui; gestor reatribui', () => {
    expect(canReassign(Role.USER)).toBe(false);
    expect(canReassign(Role.MANAGER)).toBe(true);
  });
});

describe('summarizeBulkMatch', () => {
  it('marca capped quando o recorte passa do teto', () => {
    expect(summarizeBulkMatch(120, 500)).toEqual({ take: 120, capped: false });
    expect(summarizeBulkMatch(1240, 500)).toEqual({ take: 500, capped: true });
  });
});

describe('bulkAssignConfirmMessage', () => {
  it('cita o vendedor e o recorte', () => {
    expect(
      bulkAssignConfirmMessage({
        count: 240,
        destName: 'Maria Silva',
        matchFilter: true,
      }),
    ).toBe('Atribuir 240 lead(s) do filtro atual a Maria Silva?');
    expect(
      bulkAssignConfirmMessage({
        count: 500,
        destName: 'Maria Silva',
        matchFilter: true,
        matched: 1240,
      }),
    ).toBe('Há 1240 leads no filtro. Atribuir os primeiros 500 a Maria Silva?');
  });
});

describe('filtersForBulk', () => {
  it('volta o recorte à primeira página', () => {
    const filters = filtersForBulk({ ...defaultLeadFilters(), page: 4, city: 'Campinas' });
    expect(filters.page).toBe(1);
    expect(filters.city).toBe('Campinas');
  });
});
