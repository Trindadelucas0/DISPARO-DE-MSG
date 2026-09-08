'use client';

import { ImportJobStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useImportJobs } from '@/features/import/use-import';
import { formatDateTime, formatInteger } from '@/lib/format';

const STATUS_LABEL: Readonly<Record<ImportJobStatus, string>> = {
  PENDING: 'Na fila',
  RUNNING: 'Rodando',
  COMPLETED: 'Concluída',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelada',
};

export function ImportHistory({ onOpenErrors }: { onOpenErrors: (jobId: string) => void }) {
  const query = useImportJobs();

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border">
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2">
        <h2 className="text-base font-semibold text-foreground">Importações anteriores</h2>
        <span className="text-xs text-muted-foreground">
          Inclui as cargas feitas pelo comando de linha
        </span>
      </header>

      <div className="px-3 pb-3">
        {query.isPending ? (
          <TableSkeleton rows={4} widths={['30%', '5rem', '5rem', '5rem', '9rem']} />
        ) : query.isError ? (
          <ErrorState
            cause={query.error instanceof Error ? query.error.message : 'Erro desconhecido.'}
            onRetry={() => void query.refetch()}
          />
        ) : query.data.jobs.length === 0 ? (
          <EmptyState
            title="Nenhuma importação registrada"
            description="Envie uma planilha acima para criar a primeira carga."
          />
        ) : (
          <Table>
            <THead>
              <TR className="h-9 hover:bg-muted">
                <TH>Arquivo</TH>
                <TH className="w-24">Origem</TH>
                <TH className="w-24">Status</TH>
                <TH className="w-20">Entraram</TH>
                <TH className="w-20">Rejeitadas</TH>
                <TH className="w-36">Quando</TH>
                <TH className="w-24" />
              </TR>
            </THead>
            <TBody>
              {query.data.jobs.map((job) => (
                <TR key={job.id}>
                  <TD className="max-w-0 truncate text-sm" title={job.fileName}>
                    {job.fileName}
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {job.source === 'cli' ? 'linha de comando' : 'tela'}
                  </TD>
                  <TD>
                    <Badge variant={job.status === ImportJobStatus.FAILED ? 'destructive' : 'outline'}>
                      {STATUS_LABEL[job.status]}
                    </Badge>
                  </TD>
                  <TD className="numeric text-xs">{formatInteger(job.insertedRows)}</TD>
                  <TD className="numeric text-xs">{formatInteger(job.failedRows)}</TD>
                  <TD className="numeric text-xs text-muted-foreground">
                    {formatDateTime(job.finishedAt ?? job.createdAt)}
                  </TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => onOpenErrors(job.id)}>
                      Relatório
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </section>
  );
}
