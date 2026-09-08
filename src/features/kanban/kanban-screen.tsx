'use client';

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { LeadStatus } from '@prisma/client';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { ResultBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data-state';
import { CompanyIdentity } from '@/components/ui/record-avatar';
import { KANBAN_STATUS_ORDER, isKanbanVisibleStatus, leadStatusLabel } from '@/constants/lead-status';
import { FilterBar } from '@/features/leads/filter-bar';
import { LeadDrawer } from '@/features/leads/lead-drawer';
import { useLeadFacets } from '@/features/leads/use-leads';
import { useLeadFilters } from '@/features/leads/use-lead-filters';
import type { LeadFilters } from '@/features/leads/schema';
import { useChangeLeadStatus, useKanbanColumn } from '@/features/kanban/use-kanban';
import { useSessionUser } from '@/features/auth/session-context';
import { isSellerRole } from '@/lib/auth/access';
import { errorMessage } from '@/lib/api-client';
import { formatDate, formatInteger, formatPhone } from '@/lib/format';
import { IDB_KEYS, idbGet, idbSet } from '@/lib/idb';
import { cn } from '@/lib/utils';
import type { KanbanCard } from '@/server/services/kanban.service';

const CLOSED: ReadonlySet<LeadStatus> = new Set(['CUSTOMER', 'LOST']);

function ColumnSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="border-b border-border px-2 py-2">
          <div className="h-3 w-40 rounded-sm bg-muted" />
          <div className="mt-1 h-3 w-24 rounded-sm bg-muted" />
          <div className="mt-1 h-3 w-16 rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Card({
  card,
  compact,
  showOwner,
  onOpen,
}: {
  card: KanbanCard;
  compact: boolean;
  showOwner: boolean;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: !card.canWrite,
  });
  const hidePhone = !card.whatsapp && !card.telefone;
  const place = [card.cidade, card.estado].filter(Boolean).join('/') || 'Sem cidade';
  const phone = card.whatsapp || card.telefone;
  const ownerLabel = card.mine ? 'Você' : (card.responsavelNome ?? 'Sem responsável');

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onOpen(card.id)}
      className={cn(
        'flex w-full flex-col gap-0.5 border-b border-border px-2 py-2 text-left',
        'hover:bg-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isDragging && 'bg-muted opacity-80',
        !card.canWrite && 'opacity-70',
      )}
    >
      <CompanyIdentity
        id={card.id}
        razaoSocial={card.razaoSocial}
        nomeFantasia={card.nomeFantasia}
      />
      {compact ? (
        <>
          {showOwner ? (
            <span
              className={cn(
                'truncate text-2xs',
                card.mine ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {ownerLabel}
            </span>
          ) : null}
          <span className="numeric text-2xs text-foreground">
            {card.nextContactAt ? formatDate(card.nextContactAt) : 'Sem próxima ação'}
          </span>
        </>
      ) : (
        <>
          <span className="truncate text-2xs text-foreground">{place}</span>
          {hidePhone ? null : (
            <span className="numeric truncate text-2xs text-foreground">
              {phone ? formatPhone(phone) : '—'}
            </span>
          )}
          <ResultBadge result={card.lastInteractionResult} />
          {showOwner ? (
            <span
              className={cn(
                'truncate text-2xs',
                card.mine ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {ownerLabel}
            </span>
          ) : null}
          <span className="numeric text-2xs text-foreground">
            {card.nextContactAt ? formatDate(card.nextContactAt) : 'Sem próxima ação'}
          </span>
        </>
      )}
    </button>
  );
}

function Column({
  status,
  filters,
  compact,
  showOwner,
  sellerEmpty,
  onOpen,
}: {
  status: LeadStatus;
  filters: LeadFilters;
  compact: boolean;
  showOwner: boolean;
  sellerEmpty: boolean;
  onOpen: (id: string) => void;
}) {
  const query = useKanbanColumn(status, filters);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cards = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.cards) ?? [],
    [query.data],
  );
  const total = query.data?.pages[0]?.total ?? 0;
  const overdueCount = query.data?.pages[0]?.overdueCount ?? 0;

  if (query.isError) {
    return (
      <div className={cn('flex shrink-0 flex-col border-r border-border', compact ? 'w-56' : 'w-72')}>
        <ErrorState
          cause={query.error instanceof Error ? query.error.message : 'Erro.'}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex shrink-0 flex-col border-r border-border',
        compact ? 'w-56' : 'w-72',
        isOver && 'bg-primary/[0.04]',
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <StatusBadge status={status} short />
        <span className="numeric ml-auto text-2xs text-foreground">{formatInteger(total)}</span>
        {overdueCount > 0 ? (
          <span className="numeric text-2xs text-destructive" title="Follow-ups atrasados nesta coluna">
            {formatInteger(overdueCount)} atras.
          </span>
        ) : null}
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <ColumnSkeleton />
        ) : cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-2xs text-muted-foreground">
            {sellerEmpty
              ? `Nenhum lead seu em ${leadStatusLabel(status)}.`
              : `Nenhum lead em ${leadStatusLabel(status)}.`}
          </p>
        ) : (
          cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              compact={compact}
              showOwner={showOwner}
              onOpen={onOpen}
            />
          ))
        )}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="m-1 w-[calc(100%-0.5rem)]"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Carregar mais
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function KanbanScreen() {
  const session = useSessionUser();
  const isSeller = isSellerRole(session?.role);
  const change = useChangeLeadStatus();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [drawerId, setDrawerId] = React.useState<string | null>(null);
  const { filters, setFilter, reset, activeCount } = useLeadFilters();
  const facets = useLeadFacets();
  const [compact, setCompact] = React.useState(false);
  const [showClosed, setShowClosed] = React.useState(true);

  React.useEffect(() => {
    if (filters.status && !isKanbanVisibleStatus(filters.status)) {
      setFilter({ status: undefined });
    }
  }, [filters.status, setFilter]);

  React.useEffect(() => {
    void idbGet<boolean>(IDB_KEYS.kanbanCompact).then((value) => {
      if (value !== undefined) setCompact(value);
    });
    void idbGet<boolean>(IDB_KEYS.kanbanShowClosed).then((value) => {
      if (value !== undefined) setShowClosed(value);
    });
  }, []);

  const toggleCompact = () => {
    setCompact((current) => {
      const next = !current;
      void idbSet(IDB_KEYS.kanbanCompact, next);
      return next;
    });
  };

  const toggleClosed = () => {
    setShowClosed((current) => {
      const next = !current;
      void idbSet(IDB_KEYS.kanbanShowClosed, next);
      return next;
    });
  };

  const columns = (showClosed
    ? KANBAN_STATUS_ORDER
    : KANBAN_STATUS_ORDER.filter((status) => !CLOSED.has(status)));

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const over = event.over?.id;
      const card = event.active.data.current?.card as KanbanCard | undefined;
      if (!over || !card) return;
      const next = String(over) as LeadStatus;
      if (card.status === next) return;
      if (!isKanbanVisibleStatus(next)) return;
      change.mutate(
        { id: card.id, status: next },
        {
          onSuccess: () => toast.success(`Movido para ${leadStatusLabel(next)}.`),
          onError: (error) => toast.error(errorMessage(error)),
        },
      );
    },
    [change],
  );

  return (
    <>
      <PageHeader title="Kanban">
        <span className="hidden text-2xs text-muted-foreground lg:inline">
          {isSeller
            ? 'Só os seus leads já contatados. Arraste o card para mudar o funil.'
            : 'Só leads já contatados. Arraste para mudar o funil. Duplo clique abre o drawer.'}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={compact}
          className={compact ? 'bg-muted' : undefined}
          onClick={toggleCompact}
        >
          Compacto
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={showClosed}
          className={showClosed ? 'bg-muted' : undefined}
          onClick={toggleClosed}
        >
          Encerrados
        </Button>
      </PageHeader>
      <FilterBar
        filters={filters}
        facets={facets.data}
        activeCount={activeCount}
        onChange={setFilter}
        onReset={reset}
        hideResponsible={isSeller}
        searchPlaceholder={isSeller ? 'Nome da empresa' : undefined}
        statusOptions={KANBAN_STATUS_ORDER}
      />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="scroll-thin flex min-h-0 flex-1 overflow-x-auto">
          {columns.map((status) => (
            <Column
              key={status}
              status={status}
              filters={filters}
              compact={compact}
              showOwner={!isSeller}
              sellerEmpty={isSeller}
              onOpen={isSeller ? () => undefined : setDrawerId}
            />
          ))}
        </div>
      </DndContext>
      {isSeller ? null : (
        <LeadDrawer
          leadId={drawerId}
          open={Boolean(drawerId)}
          onOpenChange={(open) => {
            if (!open) setDrawerId(null);
          }}
        />
      )}
    </>
  );
}
