'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { campaignStatusLabel } from '@/constants/campaign';
import { useCampaignMutations, useCampaigns } from '@/features/campaigns/use-campaigns';
import { errorMessage } from '@/lib/api-client';

export function CampaignsScreen() {
  const router = useRouter();
  const list = useCampaigns();
  const mutations = useCampaignMutations();
  const [name, setName] = React.useState('');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Campanhas" count={list.data ? String(list.data.length) : undefined}>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome da campanha"
            className="w-56"
            aria-label="Nome da nova campanha"
          />
          <Button
            size="sm"
            variant="primary"
            loading={mutations.create.isPending}
            disabled={name.trim().length < 2}
            onClick={() =>
              mutations.create.mutate(name.trim(), {
                onSuccess: (campaign) => {
                  toast.success('Rascunho criado.');
                  router.push(`/campaigns/${campaign.id}`);
                },
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            Nova campanha
          </Button>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {list.isLoading ? (
          <TableSkeleton rows={8} widths={['30%', '15%', '15%', '20%', '20%']} />
        ) : list.isError ? (
          <ErrorState cause={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState
            title="Nenhuma campanha"
                description="Crie um rascunho, filtre o público e dispare pela fila Redis."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>Status</TH>
                <TH>Público</TH>
                <TH>Conta</TH>
                <TH>Criada</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Link href={`/campaigns/${row.id}`} className="text-primary hover:underline">
                      {row.name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge variant="outline">{campaignStatusLabel(row.status)}</Badge>
                  </TD>
                  <TD className="numeric">{row.withWhatsappCount || row.totalCount || '—'}</TD>
                  <TD>{row.whatsappAccountName ?? '—'}</TD>
                  <TD className="numeric">{new Date(row.createdAt).toLocaleString('pt-BR')}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
