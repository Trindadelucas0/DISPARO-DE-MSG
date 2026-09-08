'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { MessageCircle } from 'lucide-react';

import { PageHeader } from '@/components/shell/app-shell';
import { ResultBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { CompanyIdentity } from '@/components/ui/record-avatar';
import { Table, TableScroll, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { isTypingTarget } from '@/constants/shortcuts';
import { useSessionUser } from '@/features/auth/session-context';
import { RegisterResultPopover } from '@/features/contacts/register-result-popover';
import { useContactsToday } from '@/features/contacts/use-contacts';
import { LeadDrawer } from '@/features/leads/lead-drawer';
import { WhatsappModal } from '@/features/messages/whatsapp-modal';
import { formatDate, formatInteger, formatPhone } from '@/lib/format';
import type { ContactBucket } from '@/lib/priority';
import { cn } from '@/lib/utils';
import type { ContactQueueItem } from '@/server/services/contacts.service';

const BUCKET_LABEL: Record<ContactBucket, string> = {
  overdue: 'Atrasado',
  today: 'Hoje',
  new: 'Lead novo',
  future: 'Futuro',
};

const BUCKETS = ['all', 'overdue', 'today', 'new', 'future'] as const;

function parseBucket(value: string | null): ContactBucket | 'all' {
  if (value && value !== 'all' && value in BUCKET_LABEL) return value as ContactBucket;
  return 'all';
}

export function ContactsTodayScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const session = useSessionUser();
  const bucket = parseBucket(searchParams.get('bucket'));
  const query = useContactsToday({ bucket, limit: 50 });
  const [focused, setFocused] = React.useState(0);
  const [whatsappId, setWhatsappId] = React.useState<string | null>(null);
  const [drawerId, setDrawerId] = React.useState<string | null>(null);

  const items = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const counts = query.data?.pages[0]?.counts;
  const totalInView = counts
    ? bucket === 'all'
      ? counts.overdue + counts.today + counts.new + counts.future
      : counts[bucket]
    : 0;

  React.useEffect(() => {
    setFocused(0);
  }, [bucket]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'j') setFocused((value) => Math.min(value + 1, Math.max(items.length - 1, 0)));
      if (event.key === 'k') setFocused((value) => Math.max(value - 1, 0));
      if (event.key === 'Enter') {
        const row = items[focused];
        if (row) setDrawerId(row.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, items]);

  const setBucket = (next: ContactBucket | 'all') => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('bucket');
    else params.set('bucket', next);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const whatsappLead = items.find((row) => row.id === whatsappId) ?? null;

  return (
    <>
      <PageHeader
        title="Contatos do dia"
        count={counts ? `${formatInteger(totalInView)} na fila` : undefined}
      />

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-4">
        {BUCKETS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={bucket === key ? 'primary' : 'ghost'}
            onClick={() => setBucket(key)}
          >
            {key === 'all' ? 'Todos' : BUCKET_LABEL[key]}
            {counts ? (
              <span className="numeric ml-1">
                {formatInteger(
                  key === 'all'
                    ? counts.overdue + counts.today + counts.new + counts.future
                    : counts[key],
                )}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      <TableScroll>
        {query.isPending ? (
          <TableSkeleton rows={12} widths={['12%', '28%', '6%', '10%', '12%', '8%', '16%']} />
        ) : query.isError ? (
          <ErrorState
            cause={query.error instanceof Error ? query.error.message : 'Erro.'}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Fila vazia neste recorte"
            description="Não há lead atrasado, de hoje ou novo. Agende um follow-up ou importe a base."
            action={
              <Button variant="outline" size="sm" onClick={() => router.push('/follow-ups')}>
                Abrir follow-ups
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Prioridade</TH>
                <TH>Empresa</TH>
                <TH>UF</TH>
                <TH>Status</TH>
                <TH>Última interação</TH>
                <TH>Próximo</TH>
                <TH>Ação</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row, index) => (
                <QueueRow
                  key={row.id}
                  row={row}
                  focused={index === focused}
                  onFocus={() => setFocused(index)}
                  onOpen={() => setDrawerId(row.id)}
                  onWhatsapp={() => setWhatsappId(row.id)}
                />
              ))}
            </TBody>
          </Table>
        )}
      </TableScroll>

      {query.hasNextPage ? (
        <div className="flex h-10 items-center justify-end border-t border-border px-4">
          <Button
            variant="ghost"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}

      {whatsappLead ? (
        <WhatsappModal
          open
          onOpenChange={(open) => {
            if (!open) setWhatsappId(null);
          }}
          leadId={whatsappLead.id}
          leadName={whatsappLead.razaoSocial}
          hasWhatsapp={Boolean(whatsappLead.whatsapp)}
          vars={{
            razaoSocial: whatsappLead.razaoSocial,
            nomeFantasia: whatsappLead.nomeFantasia ?? '',
            cidade: whatsappLead.cidade ?? '',
            estado: whatsappLead.estado ?? '',
            telefone: whatsappLead.telefone ?? '',
            whatsapp: whatsappLead.whatsapp ?? '',
            email: whatsappLead.email ?? '',
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

function QueueRow({
  row,
  focused,
  onFocus,
  onOpen,
  onWhatsapp,
}: {
  row: ContactQueueItem;
  focused: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onWhatsapp: () => void;
}) {
  return (
    <TR
      focused={focused}
      onClick={onFocus}
      onDoubleClick={onOpen}
      className={cn(row.bucket === 'overdue' && 'bg-destructive/[0.04]')}
    >
      <TD>
        <span className="text-2xs font-medium uppercase tracking-wide text-foreground">
          {BUCKET_LABEL[row.bucket]}
        </span>
      </TD>
      <TD>
        <button type="button" className="min-w-0 text-left" onClick={onOpen}>
          <CompanyIdentity
            id={row.id}
            razaoSocial={row.razaoSocial}
            nomeFantasia={row.nomeFantasia}
          />
        </button>
      </TD>
      <TD className="numeric text-sm text-foreground">{row.estado ?? '—'}</TD>
      <TD>
        <StatusBadge status={row.status} short />
      </TD>
      <TD>
        <ResultBadge result={row.lastInteractionResult} />
      </TD>
      <TD className="numeric text-sm text-foreground">{formatDate(row.nextContactAt)}</TD>
      <TD onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-1">
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
          {row.telefone ? (
            <span className="numeric text-2xs text-foreground">{formatPhone(row.telefone)}</span>
          ) : null}
          <RegisterResultPopover leadId={row.id} type="PHONE" />
        </div>
      </TD>
    </TR>
  );
}
