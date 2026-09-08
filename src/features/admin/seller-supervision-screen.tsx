'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/shell/app-shell';
import { ConversationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { PropertyRow } from '@/components/ui/property-row';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet, errorMessage } from '@/lib/api-client';

export function SellerSupervisionScreen({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ['admin', 'atendimento', userId],
    queryFn: ({ signal }) =>
      apiGet<{
        seller: { id: string; name: string; email: string };
        metrics: {
          open: number;
          responded: number;
          resolved: number;
          transferred: number;
          qualified: number;
          meetings: number;
          customers: number;
          avgFirstResponseMs: number | null;
        };
        conversations: {
          id: string;
          status: 'OPEN' | 'WAITING' | 'RESOLVED';
          unreadCount: number;
          lastMessageAt: string | null;
          lastMessagePreview: string | null;
          razaoSocial: string;
        }[];
      }>(`/api/admin/atendimento/${userId}`, signal),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={query.data?.seller.name ?? 'Vendedor'}>
        <Button size="sm" variant="outline" asChild>
          <Link href="/admin/atendimento">Voltar</Link>
        </Button>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <TableSkeleton rows={8} widths={['30%', '15%', '40%', '15%']} />
        ) : query.isError || !query.data ? (
          <ErrorState
            cause={query.error ? errorMessage(query.error) : 'Não encontrado.'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="mb-4 max-w-md">
              <PropertyRow label="E-mail">{query.data.seller.email}</PropertyRow>
              <PropertyRow label="Abertas">
                <span className="numeric">{query.data.metrics.open}</span>
              </PropertyRow>
              <PropertyRow label="Respondidas">
                <span className="numeric">{query.data.metrics.responded}</span>
              </PropertyRow>
              <PropertyRow label="Resolvidas">
                <span className="numeric">{query.data.metrics.resolved}</span>
              </PropertyRow>
              <PropertyRow label="Qualificados (funil)">
                <span className="numeric">{query.data.metrics.qualified}</span>
              </PropertyRow>
              <PropertyRow label="Reuniões (funil)">
                <span className="numeric">{query.data.metrics.meetings}</span>
              </PropertyRow>
              <PropertyRow label="Clientes (funil)">
                <span className="numeric">{query.data.metrics.customers}</span>
              </PropertyRow>
            </div>
            {!query.data.conversations.length ? (
              <EmptyState title="Sem conversas" description="Este vendedor ainda não tem conversas atribuídas." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Empresa</TH>
                    <TH>Status</TH>
                    <TH>Última mensagem</TH>
                    <TH>Quando</TH>
                  </TR>
                </THead>
                <TBody>
                  {query.data.conversations.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link href={`/inbox/${row.id}`} className="text-primary hover:underline">
                          {row.razaoSocial}
                        </Link>
                      </TD>
                      <TD>
                        <ConversationBadge status={row.status} />
                      </TD>
                      <TD className="max-w-xs truncate">{row.lastMessagePreview ?? '—'}</TD>
                      <TD className="numeric">
                        {row.lastMessageAt
                          ? new Date(row.lastMessageAt).toLocaleString('pt-BR')
                          : '—'}
                      </TD>
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
