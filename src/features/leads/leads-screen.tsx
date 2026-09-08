'use client';

import type { Role } from '@prisma/client';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { useFocusSearchShortcut } from '@/components/shell/topbar';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  TableSkeleton,
} from '@/components/ui/data-state';
import { Button } from '@/components/ui/button';
import { TableScroll } from '@/components/ui/table';
import { isTypingTarget } from '@/constants/shortcuts';
import { BulkBar } from '@/features/leads/bulk-bar';
import { BULK_LIMIT } from '@/features/leads/bulk-schema';
import { ManualContactForm } from '@/features/contacts/manual-contact-form';
import { FilterBar } from '@/features/leads/filter-bar';
import { LEAD_COLUMN_WIDTHS } from '@/features/leads/columns';
import { LeadDrawer } from '@/features/leads/lead-drawer';
import { LeadsTable } from '@/features/leads/leads-table';
import { Pagination } from '@/features/leads/pagination';
import { LEAD_SORT_LABELS, leadFilterSelectionKey } from '@/features/leads/filter-model';
import { useLeadFilters } from '@/features/leads/use-lead-filters';
import { useCreateManualLead, useLeadFacets, useLeadList } from '@/features/leads/use-leads';
import { ApiError, errorMessage } from '@/lib/api-client';
import { formatInteger } from '@/lib/format';

/**
 * Tela de leads. Orquestra filtros (URL), dados (TanStack Query), seleção e o
 * contrato de teclado. Nenhuma regra de negócio vive aqui.
 */
export function LeadsScreen({ role }: { role: Role }) {
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);
  useFocusSearchShortcut(searchRef);

  const { filters, setFilter, setPage, toggleSort, reset, activeCount } = useLeadFilters();
  const list = useLeadList(filters);
  const facets = useLeadFacets();
  const createManual = useCreateManualLead();

  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [matchFilter, setMatchFilter] = React.useState(false);
  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const [drawerId, setDrawerId] = React.useState<string | null>(null);
  const [focusNextAction, setFocusNextAction] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  // Memo para o array não trocar de identidade a cada render: os atalhos de
  // teclado e o "selecionar todos" dependem dele.
  const rows = React.useMemo(() => list.data?.rows ?? [], [list.data]);
  const filterKey = React.useMemo(() => leadFilterSelectionKey(filters), [filters]);

  // Trocar o recorte invalida a seleção. Paginar no modo filtro não zera:
  // o servidor aplica o filtro, não a página visível.
  React.useEffect(() => {
    setSelected(new Set());
    setMatchFilter(false);
    setFocusedIndex(-1);
  }, [filterKey]);

  const toggleRow = React.useCallback(
    (id: string) => {
      if (matchFilter) {
        setMatchFilter(false);
        setSelected(new Set(rows.map((row) => row.id).filter((rowId) => rowId !== id)));
        return;
      }
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [matchFilter, rows],
  );

  const toggleAll = React.useCallback(() => {
    if (matchFilter) {
      setMatchFilter(false);
      setSelected(new Set());
      return;
    }
    setSelected((current) => {
      const allSelected = rows.length > 0 && rows.every((row) => current.has(row.id));
      return allSelected ? new Set() : new Set(rows.map((row) => row.id));
    });
  }, [matchFilter, rows]);

  const clearSelection = React.useCallback(() => {
    setSelected(new Set());
    setMatchFilter(false);
  }, []);

  const selectMatchingFilter = React.useCallback(() => {
    setMatchFilter(true);
    setSelected(new Set());
  }, []);

  // Atalhos de linha (regra ux-ui-crm §6). Não disparam com foco em campo.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (rows.length === 0) return;

      const current = focusedIndex;

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex(Math.min(current + 1, rows.length - 1));
        return;
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex(Math.max(current - 1, 0));
        return;
      }

      if (current < 0 || current >= rows.length) return;
      const row = rows[current];
      if (!row) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        setFocusNextAction(false);
        setDrawerId(row.id);
        return;
      }
      if (event.key === 'e') {
        event.preventDefault();
        router.push(`/leads/${row.id}?edit=1`);
        return;
      }
      if (event.key === 'x') {
        event.preventDefault();
        toggleRow(row.id);
        return;
      }
      if (event.key === 'w') {
        event.preventDefault();
        setFocusNextAction(true);
        setDrawerId(row.id);
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedIndex, router, rows, toggleRow]);

  const selectedIds = React.useMemo(() => [...selected], [selected]);
  const visualSelected = React.useMemo(
    () => (matchFilter ? new Set(rows.map((row) => row.id)) : selected),
    [matchFilter, rows, selected],
  );
  const hidden = list.data?.hiddenBySituacao ?? [];
  const hiddenTotal = hidden.reduce((total, entry) => total + entry.count, 0);
  const matchTotal = list.data?.total ?? 0;
  const matchCount = Math.min(matchTotal, BULK_LIMIT);
  const showMatchBanner = rows.length > 0;

  return (
    <>
      <PageHeader
        title="Leads"
        count={list.data ? `${formatInteger(list.data.total)} no filtro atual` : undefined}
      >
        <Button size="sm" variant={adding ? 'outline' : 'primary'} onClick={() => setAdding((open) => !open)}>
          {adding ? 'Fechar' : 'Adicionar contato'}
        </Button>
      </PageHeader>

      {adding ? (
        <div className="shrink-0 border-b border-border px-4 py-3">
          <ManualContactForm
            idPrefix="leads-contact"
            submitLabel="Salvar contato"
            pending={createManual.isPending}
            onSubmit={(values) =>
              createManual.mutate(values, {
                onSuccess: (lead) => {
                  setAdding(false);
                  setDrawerId(lead.id);
                  toast.success(lead.created ? 'Contato salvo.' : 'Contato já existia na base.');
                },
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          />
        </div>
      ) : null}

      <FilterBar
        filters={filters}
        facets={facets.data}
        activeCount={activeCount}
        searchRef={searchRef}
        onChange={setFilter}
        onReset={reset}
      />

      {hiddenTotal > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-subtle px-4 py-1.5">
          <span className="text-xs text-muted-foreground">
            {formatInteger(hiddenTotal)} empresa(s) fora da listagem por situação cadastral (
            {hidden.map((entry) => `${entry.count} ${entry.situacao}`).join(', ')}).
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilter({ situacao: 'all' })}
            className="h-6"
          >
            Mostrar todas
          </Button>
        </div>
      ) : null}

      {showMatchBanner ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-subtle px-4 py-1.5">
          {matchFilter ? (
            <>
              <span className="numeric text-xs text-muted-foreground">
                {formatInteger(matchCount)} do filtro atual selecionados
                {matchTotal > BULK_LIMIT
                  ? ` (há ${formatInteger(matchTotal)}; entram os primeiros ${formatInteger(BULK_LIMIT)} na ordem ${LEAD_SORT_LABELS[filters.sort]}).`
                  : '.'}
              </span>
              <Button variant="ghost" size="sm" onClick={clearSelection} className="h-6">
                Limpar seleção
              </Button>
            </>
          ) : (
            <>
              <span className="numeric text-xs text-muted-foreground">
                {formatInteger(rows.length)} desta página.
              </span>
              <Button variant="ghost" size="sm" onClick={selectMatchingFilter} className="h-6">
                Selecionar os{' '}
                <span className="numeric">{formatInteger(matchCount)}</span> do filtro atual
                {matchTotal > BULK_LIMIT ? (
                  <span className="numeric"> (máx. {formatInteger(BULK_LIMIT)})</span>
                ) : null}
              </Button>
            </>
          )}
        </div>
      ) : null}

      <TableScroll>
        {list.isPending ? (
          <TableSkeleton rows={16} widths={LEAD_COLUMN_WIDTHS} />
        ) : list.isError ? (
          list.error instanceof ApiError && list.error.kind === 'forbidden' ? (
            <ForbiddenState reason={list.error.message} />
          ) : (
            <ErrorState
              cause={list.error instanceof Error ? list.error.message : 'Erro desconhecido.'}
              onRetry={() => void list.refetch()}
            />
          )
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nenhum lead com esses filtros"
            description={
              activeCount > 0
                ? 'Os filtros aplicados não retornaram nenhuma empresa. Limpe os filtros ou amplie a busca.'
                : 'A base está vazia neste filtro. Adicione um contato ou importe uma planilha.'
            }
            action={
              activeCount > 0 ? (
                <Button variant="outline" size="sm" onClick={reset}>
                  Limpar filtros
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
                    Adicionar contato
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => router.push('/import')}>
                    Importar planilha
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <LeadsTable
            rows={rows}
            selected={visualSelected}
            focusedIndex={focusedIndex}
            sort={filters.sort}
            dir={filters.dir}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            onSort={toggleSort}
            onFocusRow={setFocusedIndex}
            onOpenRow={(id) => {
              setFocusNextAction(false);
              setDrawerId(id);
            }}
            onWhatsapp={(id) => {
              setFocusNextAction(true);
              setDrawerId(id);
            }}
          />
        )}
      </TableScroll>

      {list.data ? (
        <Pagination
          page={list.data.page}
          limit={list.data.limit}
          total={list.data.total}
          totalPages={list.data.totalPages}
          loading={list.isFetching}
          onPage={setPage}
          onLimit={(limit) => setFilter({ limit })}
        />
      ) : null}

      {matchFilter || selectedIds.length > 0 ? (
        <BulkBar
          selectedIds={selectedIds}
          matchFilter={matchFilter}
          matchTotal={matchTotal}
          filters={filters}
          facets={facets.data}
          canReassign={role === 'ADMIN' || role === 'MANAGER'}
          canCreateCampaign={role === 'ADMIN' || role === 'MANAGER'}
          onClear={clearSelection}
        />
      ) : null}

      <LeadDrawer
        leadId={drawerId}
        open={Boolean(drawerId)}
        focusNextAction={focusNextAction}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerId(null);
            setFocusNextAction(false);
          }
        }}
      />
    </>
  );
}
