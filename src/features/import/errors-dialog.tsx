'use client';

import { ImportIssueSeverity } from '@prisma/client';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useImportErrors } from '@/features/import/use-import';
import { formatInteger } from '@/lib/format';

/**
 * Relatório do que não entrou.
 *
 * Separa linha rejeitada (o lead não existe) de campo descartado (o lead entrou
 * sem aquele dado). São problemas diferentes e exigem ações diferentes.
 */
export function ImportErrorsDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = React.useState(1);
  const query = useImportErrors(open ? jobId : null, page);

  React.useEffect(() => {
    if (open) setPage(1);
  }, [open, jobId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Relatório da importação</DialogTitle>
          <DialogDescription>
            ERRO significa que a linha foi rejeitada e o lead não entrou. AVISO significa que o
            lead entrou, mas um campo inválido foi descartado.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {query.isPending ? (
            <TableSkeleton rows={10} widths={['3rem', '6rem', '7rem', '60%']} />
          ) : query.isError ? (
            <ErrorState
              cause={query.error instanceof Error ? query.error.message : 'Erro desconhecido.'}
              onRetry={() => void query.refetch()}
            />
          ) : query.data.rows.length === 0 ? (
            <EmptyState
              title="Nada a relatar"
              description="Todas as linhas do arquivo entraram sem rejeição nem campo descartado."
            />
          ) : (
            <Table>
              <THead>
                <TR className="h-9 hover:bg-muted">
                  <TH className="w-16">Linha</TH>
                  <TH className="w-20">Tipo</TH>
                  <TH className="w-32">Campo</TH>
                  <TH>Motivo</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="numeric text-xs text-muted-foreground">{row.rowNumber}</TD>
                    <TD>
                      <Badge
                        variant={
                          row.severity === ImportIssueSeverity.ERROR ? 'destructive' : 'outline'
                        }
                      >
                        {row.severity === ImportIssueSeverity.ERROR ? 'ERRO' : 'AVISO'}
                      </Badge>
                    </TD>
                    <TD className="text-xs text-muted-foreground">{row.field ?? '—'}</TD>
                    <TD className="text-pretty text-xs">{row.reason}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </DialogBody>

        <DialogFooter>
          {query.data ? (
            <>
              <span className="numeric mr-auto text-xs text-muted-foreground">
                {formatInteger(query.data.total)} registro(s) · página {query.data.page} de{' '}
                {query.data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= query.data.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
