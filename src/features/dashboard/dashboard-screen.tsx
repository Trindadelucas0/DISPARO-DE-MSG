'use client';

import type { LeadStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/data-state';
import { FunnelBars } from '@/components/ui/funnel-bars';
import { KpiStat, KpiStatSkeleton } from '@/components/ui/kpi-stat';
import { useDashboard } from '@/features/dashboard/use-dashboard';
import type { DashboardFilters } from '@/features/dashboard/schema';
import { FilterBar } from '@/features/leads/filter-bar';
import { useLeadFacets } from '@/features/leads/use-leads';
import { useLeadFilters } from '@/features/leads/use-lead-filters';
import { ApiError } from '@/lib/api-client';
import { toIsoDate } from '@/lib/dates';
import { formatDateTime, formatInteger } from '@/lib/format';
import { LeadDrawer } from '@/features/leads/lead-drawer';
import * as React from 'react';

export function DashboardScreen() {
  const router = useRouter();
  const { filters, setFilter, reset, activeCount } = useLeadFilters();
  const dashFilters: DashboardFilters = {
    search: filters.search,
    status: filters.status,
    state: filters.state,
    city: filters.city,
    segment: filters.segment,
    source: filters.source,
    responsible: filters.responsible,
    tag: filters.tag,
    porte: filters.porte,
    situacao: filters.situacao,
    hasWhatsapp: filters.hasWhatsapp,
    hasPhone: filters.hasPhone,
    hasEmail: filters.hasEmail,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    lastContactFrom: filters.lastContactFrom,
    lastContactTo: filters.lastContactTo,
    nextContactFrom: filters.nextContactFrom,
    nextContactTo: filters.nextContactTo,
    lastResult: filters.lastResult,
  };
  const query = useDashboard(dashFilters);
  const facets = useLeadFacets();
  const [drawerId, setDrawerId] = React.useState<string | null>(null);

  const today = toIsoDate();

  const applyKpi = (key: string) => {
    if (key === 'total') {
      setFilter({
        status: undefined,
        hasWhatsapp: undefined,
        lastResult: undefined,
        nextContactFrom: undefined,
        nextContactTo: undefined,
      });
      return;
    }
    if (key === 'whatsapp') {
      setFilter({ hasWhatsapp: true, status: undefined, lastResult: undefined });
      return;
    }
    if (key === 'contactToday') {
      setFilter({
        nextContactFrom: today,
        nextContactTo: today,
        status: undefined,
        lastResult: undefined,
      });
      return;
    }
    if (key === 'contacted') {
      setFilter({ status: 'CONTACTED', lastResult: undefined });
      return;
    }
    if (key === 'responded') {
      setFilter({ lastResult: 'RESPONDED', status: undefined });
      return;
    }
    if (key === 'qualified') {
      setFilter({ status: 'QUALIFIED', lastResult: undefined });
      return;
    }
    if (key === 'customers') {
      setFilter({ status: 'CUSTOMER', lastResult: undefined });
      return;
    }
    if (key === 'overdue') {
      router.push('/follow-ups?tab=overdue');
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        count={query.data ? `${formatInteger(query.data.kpis[0]?.value ?? 0)} leads` : undefined}
      >
        <p className="hidden text-2xs text-muted-foreground lg:block">
          Clique no KPI ou no funil para filtrar a base.
        </p>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            Limpar filtros
          </Button>
        ) : null}
      </PageHeader>

      <FilterBar
        filters={filters}
        facets={facets.data}
        activeCount={activeCount}
        onChange={setFilter}
        onReset={reset}
        showSearch={false}
      />

      {query.isPending ? (
        <KpiStatSkeleton count={8} />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.kind === 'forbidden' ? (
          <ForbiddenState reason={query.error.message} />
        ) : (
          <ErrorState
            cause={query.error instanceof Error ? query.error.message : 'Erro desconhecido.'}
            onRetry={() => void query.refetch()}
          />
        )
      ) : !query.data || query.data.kpis[0]?.value === 0 ? (
        <EmptyState
          title="Nenhum lead neste recorte"
          description="Os filtros atuais não cobrem nenhuma empresa. Limpe os filtros ou importe a base."
          action={
            <Button variant="outline" size="sm" onClick={reset}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4 xl:grid-cols-8">
            {query.data.kpis.map((kpi) => (
              <KpiStat
                key={kpi.key}
                label={kpi.label}
                value={kpi.value}
                hint={kpi.hint}
                tone={kpi.key === 'overdue' && kpi.value > 0 ? 'warning' : undefined}
                onClick={() => applyKpi(kpi.key)}
                active={
                  (kpi.key === 'whatsapp' && filters.hasWhatsapp === true) ||
                  (kpi.key === 'contacted' && filters.status === 'CONTACTED') ||
                  (kpi.key === 'responded' && filters.lastResult === 'RESPONDED') ||
                  (kpi.key === 'qualified' && filters.status === 'QUALIFIED') ||
                  (kpi.key === 'customers' && filters.status === 'CUSTOMER') ||
                  (kpi.key === 'contactToday' &&
                    filters.nextContactFrom === today &&
                    filters.nextContactTo === today)
                }
              />
            ))}
          </div>

          <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className="border-b border-border xl:border-b-0 xl:border-r">
              <h2 className="col-label border-b border-border px-4 py-2">Funil</h2>
              <FunnelBars
                items={query.data.byStatus}
                activeStatus={filters.status}
                onSelect={(status: LeadStatus) => setFilter({ status, lastResult: undefined })}
              />
            </section>

            <div className="flex min-h-0 flex-col">
              <section className="border-b border-border">
                <h2 className="col-label border-b border-border px-4 py-2">Atividade de hoje</h2>
                <dl className="grid grid-cols-2">
                  <div className="flex flex-col gap-0.5 border-r border-border px-4 py-3">
                    <span className="numeric text-xl font-semibold text-foreground">
                      {formatInteger(query.data.activityToday.contacts)}
                    </span>
                    <span className="col-label">Contatos</span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-4 py-3">
                    <span className="numeric text-xl font-semibold text-foreground">
                      {formatInteger(query.data.activityToday.responses)}
                    </span>
                    <span className="col-label">Respostas</span>
                  </div>
                </dl>
              </section>

              <section className="flex min-h-0 flex-1 flex-col">
                <h2 className="col-label border-b border-border px-4 py-2">Próximas ações</h2>
                {query.data.upcoming.length === 0 ? (
                  <p className="px-4 py-6 text-pretty text-xs text-muted-foreground">
                    Nenhum follow-up pendente à frente. Agende um retorno no lead.
                  </p>
                ) : (
                  <ul>
                    {query.data.upcoming.map((row) => (
                      <li key={row.id} className="border-b border-border last:border-b-0">
                        <button
                          type="button"
                          className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-subtle"
                          onClick={() => setDrawerId(row.leadId)}
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">
                            {row.razaoSocial}
                          </span>
                          <span className="numeric shrink-0 text-xs text-foreground">
                            {formatDateTime(row.scheduledFor)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      <LeadDrawer
        leadId={drawerId}
        open={Boolean(drawerId)}
        onOpenChange={(open) => {
          if (!open) setDrawerId(null);
        }}
      />
    </>
  );
}
