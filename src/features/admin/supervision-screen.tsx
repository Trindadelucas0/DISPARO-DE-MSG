'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet, errorMessage } from '@/lib/api-client';

type Overview = {
  kpis: { open: number; unassigned: number; inProgress: number; resolved: number };
  rows: {
    id: string;
    name: string;
    open: number;
    responded: number;
    resolved: number;
    transferred: number;
    qualified: number;
    avgFirstResponseMs: number | null;
  }[];
};

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  return `${minutes} min`;
}

export function SupervisionScreen() {
  const query = useQuery({
    queryKey: ['admin', 'atendimento'],
    queryFn: ({ signal }) => apiGet<Overview>('/api/admin/atendimento', signal),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Supervisão" />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <TableSkeleton rows={8} widths={['20%', '12%', '12%', '12%', '12%', '12%']} />
        ) : query.isError ? (
          <ErrorState cause={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <EmptyState title="Sem dados" description="Ainda não há atendimento para supervisionar." />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {(
                [
                  ['open', 'Abertas'],
                  ['unassigned', 'Sem responsável'],
                  ['inProgress', 'Em atendimento'],
                  ['resolved', 'Resolvidas'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="rounded-md border border-border px-3 py-2">
                  <p className="text-2xs text-muted-foreground">{label}</p>
                  <p className="numeric text-lg font-medium">{query.data.kpis[key]}</p>
                </div>
              ))}
            </div>
            {query.data.rows.length === 0 ? (
              <EmptyState
                title="Nenhum responsável na tabela"
                description="A tabela lista qualquer usuário ativo, inclusive administrador. Cadastre vendedores em Configurações."
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/settings">Abrir configurações</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Vendedor</TH>
                    <TH>Abertas</TH>
                    <TH>Respondidas</TH>
                    <TH>TMR 1ª resp.</TH>
                    <TH>Resolvidas</TH>
                    <TH>Qualificados</TH>
                  </TR>
                </THead>
                <TBody>
                  {query.data.rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/admin/atendimento/${row.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TD>
                      <TD className="numeric">{row.open}</TD>
                      <TD className="numeric">{row.responded}</TD>
                      <TD className="numeric">{formatMs(row.avgFirstResponseMs)}</TD>
                      <TD className="numeric">{row.resolved}</TD>
                      <TD className="numeric">{row.qualified}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
