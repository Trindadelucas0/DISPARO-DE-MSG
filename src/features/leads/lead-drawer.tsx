'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { ResultBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { PropertyRow } from '@/components/ui/property-row';
import { RecordAvatar } from '@/components/ui/record-avatar';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { useSessionUser } from '@/features/auth/session-context';
import { InteractionTimeline } from '@/features/leads/interaction-timeline';
import { useLead, useUpdateLead } from '@/features/leads/use-leads';
import { WhatsappNextAction } from '@/features/messages/whatsapp-composer';
import { ApiError, errorMessage } from '@/lib/api-client';
import { dash, formatCnpj, formatDate, formatPhone, toDateInputValue } from '@/lib/format';

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="flex items-center gap-2">
        <div className="size-7 rounded-sm bg-muted" />
        <div className="h-5 w-48 rounded-sm bg-muted" />
      </div>
      <div className="h-4 w-36 rounded-sm bg-muted" />
      <div className="mt-2 flex flex-col gap-0">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex h-8 items-center justify-between border-b border-border">
            <div className="h-3 w-16 rounded-sm bg-muted" />
            <div className="h-3 w-28 rounded-sm bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeadDrawer({
  leadId,
  open,
  onOpenChange,
  focusNextAction = false,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusNextAction?: boolean;
}) {
  const router = useRouter();
  const session = useSessionUser();
  const query = useLead(leadId ?? '', { enabled: Boolean(leadId) && open });
  const update = useUpdateLead(leadId ?? '');
  const footerRef = React.useRef<HTMLDivElement>(null);
  const templateRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open || !focusNextAction) return;
    footerRef.current?.scrollIntoView({ block: 'end' });
    templateRef.current?.focus();
  }, [open, focusNextAction, query.data?.id]);

  const lead = query.data;
  const socio = lead?.socios[0]?.trim() || null;

  const saveStatus = (status: typeof lead extends undefined ? never : NonNullable<typeof lead>['status']) => {
    if (!lead) return;
    update.mutate(
      { status },
      {
        onSuccess: () => toast.success(`Status alterado para ${leadStatusLabel(status)}.`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const saveNext = (value: string) => {
    update.mutate(
      { nextContactAt: value === '' ? null : new Date(value).toISOString() },
      {
        onSuccess: () =>
          toast.success(value === '' ? 'Próximo contato removido.' : 'Follow-up agendado.'),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {!leadId ? null : query.isPending ? (
          <>
            <SheetHeader className="flex items-start justify-between gap-2">
              <SheetTitle>Lead</SheetTitle>
              <SheetCloseButton />
            </SheetHeader>
            <SheetBody>
              <DrawerSkeleton />
            </SheetBody>
          </>
        ) : query.isError ? (
          <>
            <SheetHeader className="flex items-start justify-between gap-2">
              <SheetTitle>Lead</SheetTitle>
              <SheetCloseButton />
            </SheetHeader>
            <SheetBody>
              <ErrorState
                cause={
                  query.error instanceof ApiError
                    ? query.error.message
                    : query.error instanceof Error
                      ? query.error.message
                      : 'Erro desconhecido.'
                }
                onRetry={() => void query.refetch()}
              />
            </SheetBody>
          </>
        ) : !lead ? (
          <>
            <SheetHeader className="flex items-start justify-between gap-2">
              <SheetTitle>Lead</SheetTitle>
              <SheetCloseButton />
            </SheetHeader>
            <SheetBody>
              <ErrorState
                title="Lead não encontrado"
                cause="O registro foi removido ou está fora do seu escopo de acesso."
                onRetry={() => onOpenChange(false)}
              />
            </SheetBody>
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <RecordAvatar name={lead.razaoSocial} seed={lead.cnpj} size="md" />
                  <div className="min-w-0">
                    <SheetTitle title={lead.razaoSocial}>{lead.razaoSocial}</SheetTitle>
                    <p className="numeric mt-0.5 text-xs text-foreground">{formatCnpj(lead.cnpj)}</p>
                  </div>
                </div>
                <SheetCloseButton />
              </div>
              <SheetDescription className="sr-only">
                Detalhe operacional do lead. Funil e resultado da interação são campos separados.
              </SheetDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={lead.status} />
                <ResultBadge result={lead.lastInteractionResult} />
                <span className="numeric text-xs text-foreground">
                  {lead.nextContactAt ? formatDate(lead.nextContactAt) : 'Sem próxima ação'}
                </span>
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-4">
              <section>
                <PropertyRow label="Nome fantasia">{dash(lead.nomeFantasia)}</PropertyRow>
                <PropertyRow label="Cidade / UF">
                  {dash(lead.cidade)}
                  {lead.estado ? ` / ${lead.estado}` : ''}
                </PropertyRow>
                <PropertyRow label="Telefone" numeric>
                  {lead.telefone ? formatPhone(lead.telefone) : '—'}
                </PropertyRow>
                <PropertyRow label="WhatsApp" numeric>
                  {lead.whatsapp ? formatPhone(lead.whatsapp) : 'Sem celular na base'}
                </PropertyRow>
                <PropertyRow label="E-mail">{dash(lead.email)}</PropertyRow>
                <PropertyRow label="Responsável">{dash(lead.responsavelNome)}</PropertyRow>
                {socio ? <PropertyRow label="Sócio">{socio}</PropertyRow> : null}
              </section>

              <InteractionTimeline leadId={lead.id} canEdit={lead.canEdit} />
            </SheetBody>

            <SheetFooter ref={footerRef}>
              <h3 className="col-label mb-2">Próxima ação</h3>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="drawer-status">Alterar status</Label>
                  <Select
                    value={lead.status}
                    disabled={!lead.canEdit || update.isPending}
                    onValueChange={(value) => saveStatus(value as typeof lead.status)}
                  >
                    <SelectTrigger id="drawer-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUS_ORDER.map((status) => (
                        <SelectItem key={status} value={status}>
                          {leadStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="drawer-followup">Agendar follow-up</Label>
                  <Input
                    id="drawer-followup"
                    type="date"
                    numeric
                    disabled={!lead.canEdit || update.isPending}
                    defaultValue={toDateInputValue(lead.nextContactAt)}
                    key={lead.nextContactAt ?? 'empty'}
                    onChange={(event) => saveNext(event.target.value)}
                  />
                </div>
              </div>
              {lead.canEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-3"
                  onClick={() => router.push(`/leads/${lead.id}?edit=1`)}
                >
                  <Pencil aria-hidden />
                  Editar
                </Button>
              ) : null}
              <WhatsappNextAction
                leadId={lead.id}
                hasWhatsapp={Boolean(lead.whatsappLink)}
                compact
                templateSelectRef={templateRef}
                vars={{
                  razaoSocial: lead.razaoSocial,
                  nomeFantasia: lead.nomeFantasia ?? '',
                  cidade: lead.cidade ?? '',
                  estado: lead.estado ?? '',
                  cnpj: lead.cnpj,
                  telefone: lead.telefone ?? '',
                  whatsapp: lead.whatsapp ?? '',
                  email: lead.email ?? '',
                  vendedor: session?.name ?? '',
                }}
              />
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
