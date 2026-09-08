'use client';

import type { FollowUpStatus } from '@prisma/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { useSessionUser } from '@/features/auth/session-context';
import { Badge, ResultBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { CompanyIdentity } from '@/components/ui/record-avatar';
import { Table, TableScroll, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { RegisterResultPopover } from '@/features/contacts/register-result-popover';
import { useFollowUps, usePatchFollowUp } from '@/features/contacts/use-contacts';
import { LeadDrawer } from '@/features/leads/lead-drawer';
import { useLeadFacets } from '@/features/leads/use-leads';
import { WhatsappModal } from '@/features/messages/whatsapp-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api-client';
import { addDays, startOfDay } from '@/lib/dates';
import { formatDateTime, formatInteger, formatPhone } from '@/lib/format';
import { MessageCircle } from 'lucide-react';
import type { SerializedFollowUp } from '@/server/services/follow-up.service';

const TABS = [
  { value: 'overdue', label: 'Atrasados' },
  { value: 'today', label: 'Hoje' },
  { value: 'upcoming', label: 'Próximos' },
  { value: 'all', label: 'Todos' },
] as const;

const SECONDARY: readonly { value: FollowUpStatus; label: string }[] = [
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

export function FollowUpsScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (searchParams.get('tab') as (typeof TABS)[number]['value'] | null) ?? 'overdue';
  const status = searchParams.get('status') as FollowUpStatus | null;
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const facets = useLeadFacets();
  const responsible = searchParams.get('responsible') ?? undefined;
  const leadStatus = searchParams.get('leadStatus') ?? undefined;
  const state = searchParams.get('state') ?? undefined;
  const [drawerId, setDrawerId] = React.useState<string | null>(null);
  const [whatsappRow, setWhatsappRow] = React.useState<SerializedFollowUp | null>(null);
  const session = useSessionUser();

  const query = useFollowUps({
    tab,
    status: status ?? undefined,
    page,
    limit: 50,
    responsible,
    leadStatus,
    state,
  });
  const patch = usePatchFollowUp();

  const setQuery = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.set('page', patch.page ?? '1');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const apply = (row: SerializedFollowUp, next: FollowUpStatus) => {
    patch.mutate(
      { id: row.id, status: next },
      {
        onSuccess: () => toast.success(next === 'COMPLETED' ? 'Follow-up concluído.' : 'Follow-up cancelado.'),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const reschedule = (row: SerializedFollowUp, days: number) => {
    patch.mutate(
      { id: row.id, scheduledFor: addDays(startOfDay(), days).toISOString(), status: 'PENDING' },
      {
        onSuccess: () => toast.success(`Reagendado para daqui a ${days} dia(s).`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const counts = query.data?.counts;
  const items = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Follow-ups"
        count={query.data ? `${formatInteger(query.data.total)} no recorte` : undefined}
      />

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-4">
        {TABS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={tab === item.value && !status ? 'primary' : 'ghost'}
            onClick={() => setQuery({ tab: item.value, status: undefined })}
          >
            {item.label}
            {counts ? (
              <span className="numeric ml-1">{formatInteger(counts[item.value])}</span>
            ) : null}
          </Button>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        {SECONDARY.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={status === item.value ? 'primary' : 'ghost'}
            onClick={() => setQuery({ status: status === item.value ? undefined : item.value })}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Select
          value={leadStatus ?? '__any__'}
          onValueChange={(value) => setQuery({ leadStatus: value === '__any__' ? undefined : value })}
        >
          <SelectTrigger className="w-40" aria-label="Status do lead">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Status</SelectItem>
            {LEAD_STATUS_ORDER.map((item) => (
              <SelectItem key={item} value={item}>
                {leadStatusLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state ?? '__any__'}
          onValueChange={(value) => setQuery({ state: value === '__any__' ? undefined : value })}
        >
          <SelectTrigger className="w-24" aria-label="UF">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">UF</SelectItem>
            {(facets.data?.states ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={responsible ?? '__any__'}
          onValueChange={(value) =>
            setQuery({ responsible: value === '__any__' ? undefined : value })
          }
        >
          <SelectTrigger className="w-40" aria-label="Responsável">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Responsável</SelectItem>
            {(facets.data?.responsaveis ?? []).map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TableScroll>
        {query.isPending ? (
          <TableSkeleton rows={12} widths={['22%', '10%', '12%', '12%', '12%', '10%', '22%']} />
        ) : query.isError ? (
          <ErrorState
            cause={query.error instanceof Error ? query.error.message : 'Erro.'}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhum follow-up neste recorte"
            description="Agende um retorno no detalhe do lead ou registre um contato que peça callback."
            action={
              <Button variant="outline" size="sm" onClick={() => router.push('/leads')}>
                Abrir leads
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Empresa</TH>
                <TH>Responsável</TH>
                <TH>Status</TH>
                <TH>Último contato</TH>
                <TH>Próxima ação</TH>
                <TH>Telefone</TH>
                <TH>Ação</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <FollowUpRow
                  key={row.id}
                  row={row}
                  pending={patch.isPending}
                  onOpen={() => setDrawerId(row.leadId)}
                  onWhatsapp={() => setWhatsappRow(row)}
                  onComplete={() => apply(row, 'COMPLETED')}
                  onCancel={() => apply(row, 'CANCELLED')}
                  onReschedule={(days) => reschedule(row, days)}
                />
              ))}
            </TBody>
          </Table>
        )}
      </TableScroll>

      {query.data && query.data.totalPages > 1 ? (
        <div className="flex h-10 items-center justify-end gap-2 border-t border-border px-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setQuery({ page: String(page - 1) })}
          >
            Anterior
          </Button>
          <span className="numeric text-xs text-foreground">
            {page} / {query.data.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= query.data.totalPages}
            onClick={() => setQuery({ page: String(page + 1) })}
          >
            Próxima
          </Button>
        </div>
      ) : null}

      {whatsappRow ? (
        <WhatsappModal
          open
          onOpenChange={(open) => {
            if (!open) setWhatsappRow(null);
          }}
          leadId={whatsappRow.leadId}
          leadName={whatsappRow.razaoSocial}
          hasWhatsapp={Boolean(whatsappRow.whatsapp)}
          vars={{
            razaoSocial: whatsappRow.razaoSocial,
            nomeFantasia: whatsappRow.nomeFantasia ?? '',
            cidade: whatsappRow.cidade ?? '',
            estado: whatsappRow.estado ?? '',
            telefone: whatsappRow.telefone ?? '',
            whatsapp: whatsappRow.whatsapp ?? '',
            email: whatsappRow.email ?? '',
            vendedor: session?.name ?? '',
          }}
        />
      ) : null}

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

function FollowUpRow({
  row,
  pending,
  onOpen,
  onWhatsapp,
  onComplete,
  onCancel,
  onReschedule,
}: {
  row: SerializedFollowUp;
  pending: boolean;
  onOpen: () => void;
  onWhatsapp: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onReschedule: (days: number) => void;
}) {
  const open = row.status === 'PENDING' || row.status === 'OVERDUE';

  return (
    <TR className={row.status === 'OVERDUE' ? 'h-auto bg-destructive/[0.06]' : 'h-auto'}>
      <TD>
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <CompanyIdentity
            id={row.leadId}
            razaoSocial={row.razaoSocial}
            nomeFantasia={row.nomeFantasia}
          />
        </button>
      </TD>
      <TD className="text-sm text-foreground">{row.responsavelNome}</TD>
      <TD>
        <div className="flex items-center gap-1">
          <StatusBadge status={row.leadStatus} short />
          {row.status === 'OVERDUE' ? <Badge variant="destructive">Atrasado</Badge> : null}
        </div>
      </TD>
      <TD>
        <ResultBadge result={row.lastInteractionResult} />
      </TD>
      <TD className="numeric text-sm text-foreground">{formatDateTime(row.scheduledFor)}</TD>
      <TD className="numeric text-sm text-foreground">
        {row.whatsapp ? formatPhone(row.whatsapp) : row.telefone ? formatPhone(row.telefone) : '—'}
      </TD>
      <TD onClick={(event) => event.stopPropagation()}>
        {open ? (
          <div className="flex flex-wrap items-center gap-1 py-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onWhatsapp}
              disabled={!row.whatsapp}
              aria-label={
                row.whatsapp
                  ? `WhatsApp de ${row.razaoSocial}`
                  : `Sem celular na base para ${row.razaoSocial}`
              }
              title={row.whatsapp ? 'Abrir WhatsApp' : 'Sem celular na base'}
            >
              <MessageCircle aria-hidden />
            </Button>
            <RegisterResultPopover leadId={row.leadId} type="WHATSAPP" />
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onReschedule(1)}>
              +1
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onReschedule(3)}>
              +3
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onReschedule(7)}>
              +7
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={onComplete}>
              Concluir
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Ver lead
          </Button>
        )}
      </TD>
    </TR>
  );
}
