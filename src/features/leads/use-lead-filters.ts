'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { filtersToSearchParams, parseFiltersFromParams } from '@/features/leads/query';
import { type LeadFilters, type LeadSortField, countActiveFilters } from '@/features/leads/schema';

/**
 * Filtros da listagem lidos e escritos na URL.
 *
 * Manter na URL faz o link ser compartilhável, o botão voltar funcionar e o
 * estado sobreviver a um F5 — coisas que um `useState` local perderia.
 */
export function useLeadFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = React.useMemo(
    () => parseFiltersFromParams(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  const push = React.useCallback(
    (next: LeadFilters) => {
      const query = filtersToSearchParams(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  /** Mudar qualquer critério volta para a página 1: manter o offset mostraria vazio. */
  const setFilter = React.useCallback(
    (patch: Partial<LeadFilters>) => {
      push({ ...filters, ...patch, page: patch.page ?? 1 });
    },
    [filters, push],
  );

  const setPage = React.useCallback(
    (page: number) => {
      push({ ...filters, page });
    },
    [filters, push],
  );

  /** Clicar na coluna já ordenada inverte a direção. */
  const toggleSort = React.useCallback(
    (field: LeadSortField) => {
      const dir = filters.sort === field && filters.dir === 'desc' ? 'asc' : 'desc';
      push({ ...filters, sort: field, dir, page: 1 });
    },
    [filters, push],
  );

  const reset = React.useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return {
    filters,
    setFilter,
    setPage,
    toggleSort,
    reset,
    activeCount: countActiveFilters(filters),
  };
}
