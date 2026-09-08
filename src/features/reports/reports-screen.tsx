'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { ChartCard } from '@/components/ui/chart-card';
import { EmptyState, ErrorState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { KpiStat, KpiStatSkeleton } from '@/components/ui/kpi-stat';
import { Label } from '@/components/ui/primitives';
import { INTERACTION_RESULT_ORDER, interactionResultCssVar } from '@/constants/interactions';
import { apiGet } from '@/lib/api-client';
import { toDateInputValue } from '@/lib/format';
import { daysAgo } from '@/lib/dates';
import type { ReportsPayload } from '@/server/services/reports.service';

function useReports(from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return useQuery({
    queryKey: ['reports', from, to],
    queryFn: ({ signal }) => apiGet<ReportsPayload>(`/api/reports?${params.toString()}`, signal),
    staleTime: 60_000,
  });
}

export function ReportsScreen() {
  const [from, setFrom] = React.useState(toDateInputValue(daysAgo(30)));
  const [to, setTo] = React.useState(toDateInputValue(new Date()));
  const query = useReports(from, to);

  const exportHref = `/api/export?format=xlsx&situacao=all`;

  return (
    <>
      <PageHeader title="Relatórios">
        <Button variant="outline" size="sm" asChild>
          <a href="/api/export?format=csv&situacao=all">Exportar CSV</a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={exportHref}>Exportar XLSX</a>
        </Button>
      </PageHeader>

      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="col-label">Período</span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 text-xs text-foreground">
          <Label htmlFor="rep-from" className="text-muted-foreground">
            De
          </Label>
          <Input id="rep-from" type="date" numeric className="h-6 w-32 border-0 bg-transparent px-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 text-xs text-foreground">
          <Label htmlFor="rep-to" className="text-muted-foreground">
            Até
          </Label>
          <Input id="rep-to" type="date" numeric className="h-6 w-32 border-0 bg-transparent px-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </span>
      </div>

      {query.isPending ? (
        <KpiStatSkeleton count={4} />
      ) : query.isError ? (
        <ErrorState
          cause={query.error instanceof Error ? query.error.message : 'Erro.'}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.totalInteractions === 0 ? (
        <EmptyState
          title="Nenhuma interação neste período"
          description="Os números só existem depois que o time registra contato. A exportação da base de leads no canto superior direito não depende disto."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 border-b border-border lg:grid-cols-4">
            <KpiStat label="Interações" value={query.data.totalInteractions} />
            <KpiStat label="Enviados" value={query.data.sent} />
            <KpiStat label="Respostas" value={query.data.responded} />
            <KpiStat
              label="Taxa de resposta"
              value={query.data.responseRate}
              suffix={query.data.responseRate === null ? 'sem envios' : '%'}
            />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            <ChartCard title="Por vendedor">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={query.data.byUser} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)' }}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Bar dataKey="count" isAnimationActive={false} fill="var(--chart-ink)" name="Interações" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Por resultado">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={query.data.byResult} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)' }}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Bar dataKey="count" isAnimationActive={false} name="Qtde">
                    {query.data.byResult.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={
                          INTERACTION_RESULT_ORDER.includes(entry.key as (typeof INTERACTION_RESULT_ORDER)[number])
                            ? interactionResultCssVar(entry.key as (typeof INTERACTION_RESULT_ORDER)[number])
                            : 'var(--chart-ink)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}

