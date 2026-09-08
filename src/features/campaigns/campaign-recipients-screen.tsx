'use client';

import type { CampaignRecipientStatus } from '@prisma/client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  CAMPAIGN_RECIPIENT_STATUS_ORDER,
  campaignRecipientStatusLabel,
} from '@/constants/campaign';
import { campaignKeys } from '@/features/campaigns/use-campaigns';
import { apiGet, errorMessage } from '@/lib/api-client';

const ANY = '__all__';

export function CampaignRecipientsScreen({ id }: { id: string }) {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<CampaignRecipientStatus | undefined>(undefined);
  const query = useQuery({
    queryKey: campaignKeys.recipients(id, page, status),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (status) params.set('status', status);
      return apiGet<{
        total: number;
        rows: {
          id: string;
          phone: string;
          status: CampaignRecipientStatus;
          error: string | null;
          cnpj: string;
          razaoSocial: string;
          cidade: string | null;
          estado: string | null;
        }[];
      }>(`/api/campaigns/${id}/recipients?${params}`, signal);
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Destinatários" count={query.data ? String(query.data.total) : undefined}>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/campaigns/${id}`}>Voltar</Link>
        </Button>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 flex flex-col gap-1 md:max-w-xs">
          <Label htmlFor="recipient-status">Status na campanha</Label>
          <Select
            value={status ?? ANY}
            onValueChange={(value) => {
              setPage(1);
              setStatus(value === ANY ? undefined : (value as CampaignRecipientStatus));
            }}
          >
            <SelectTrigger id="recipient-status">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos</SelectItem>
              {CAMPAIGN_RECIPIENT_STATUS_ORDER.map((value) => (
                <SelectItem key={value} value={value}>
                  {campaignRecipientStatusLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {query.isLoading ? (
          <TableSkeleton rows={12} widths={['28%', '18%', '14%', '20%', '20%']} />
        ) : query.isError ? (
          <ErrorState cause={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data?.rows.length ? (
          <EmptyState
            title={status ? 'Nenhum destinatário neste status' : 'Sem destinatários'}
            description={
              status
                ? 'Troque o filtro ou volte para a campanha e adicione outro lote.'
                : 'Inicie a campanha para materializar o público.'
            }
            action={
              status ? (
                <Button size="sm" variant="outline" onClick={() => setStatus(undefined)}>
                  Ver todos
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/campaigns/${id}`}>Voltar à campanha</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>CNPJ</TH>
                  <TH>WhatsApp</TH>
                  <TH>Status</TH>
                  <TH>Erro</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.rows.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.razaoSocial}</TD>
                    <TD className="numeric">{row.cnpj}</TD>
                    <TD className="numeric">{row.phone}</TD>
                    <TD>
                      <Badge variant="outline">{campaignRecipientStatusLabel(row.status)}</Badge>
                    </TD>
                    <TD className="text-muted-foreground">{row.error ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="numeric text-xs text-muted-foreground">Página {page}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={page * 50 >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
