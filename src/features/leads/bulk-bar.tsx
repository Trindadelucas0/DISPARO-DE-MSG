'use client';

import type { LeadStatus } from '@prisma/client';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { useCampaignMutations } from '@/features/campaigns/use-campaigns';
import {
  BULK_LIMIT,
  bulkAssignConfirmMessage,
  filtersForBulk,
} from '@/features/leads/bulk-schema';
import { LEAD_SORT_LABELS } from '@/features/leads/filter-model';
import type { LeadFilters } from '@/features/leads/schema';
import { useBulkFollowUpLeads, useBulkTagLeads, useBulkUpdateLeads } from '@/features/leads/use-leads';
import { errorMessage } from '@/lib/api-client';
import { formatInteger } from '@/lib/format';
import type { LeadFacets } from '@/server/services/lead.service';

const UNASSIGN = '__unassign__';

/**
 * Barra de ações em lote. Aparece apenas com seleção ativa e informa quantos
 * registros a operação alcançou — inclusive quando o papel do usuário
 * bloqueou parte deles.
 */
export function BulkBar({
  selectedIds,
  matchFilter,
  matchTotal,
  filters,
  facets,
  canReassign,
  canCreateCampaign,
  onClear,
}: {
  selectedIds: readonly string[];
  matchFilter?: boolean;
  matchTotal?: number;
  filters?: LeadFilters;
  facets: LeadFacets | undefined;
  canReassign: boolean;
  canCreateCampaign?: boolean;
  onClear: () => void;
}) {
  const router = useRouter();
  const bulk = useBulkUpdateLeads();
  const tags = useBulkTagLeads();
  const followUps = useBulkFollowUpLeads();
  const campaigns = useCampaignMutations();
  const matched = matchFilter ? (matchTotal ?? 0) : selectedIds.length;
  const count = matchFilter ? Math.min(matched, BULK_LIMIT) : selectedIds.length;
  const overLimit = !matchFilter && selectedIds.length > BULK_LIMIT;
  const pageActionsDisabled = Boolean(matchFilter);
  const [followDate, setFollowDate] = React.useState('');

  const onBulkSuccess = React.useCallback(
    (result: { updated: number; skipped: number; matched?: number; capped?: boolean }) => {
      const parts = [`${result.updated} lead(s) atualizado(s)`];
      if (result.skipped > 0) {
        parts.push(`${result.skipped} fora do seu escopo de acesso`);
      }
      if (result.capped) {
        parts.push(`teto de ${BULK_LIMIT}: havia ${formatInteger(result.matched)} no filtro`);
      }
      toast.success(parts.join(' · '));
      onClear();
    },
    [onClear],
  );

  const apply = React.useCallback(
    (input: { status?: LeadStatus; responsavelId?: string | null }) => {
      if (matchFilter) {
        if (!filters) return;
        bulk.mutate(
          { filters: filtersForBulk(filters), ...input },
          {
            onSuccess: onBulkSuccess,
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
        return;
      }
      bulk.mutate(
        { ids: [...selectedIds], ...input },
        {
          onSuccess: onBulkSuccess,
          onError: (error) => toast.error(errorMessage(error)),
        },
      );
    },
    [bulk, filters, matchFilter, onBulkSuccess, selectedIds],
  );

  const applyAssign = React.useCallback(
    (value: string) => {
      const unassign = value === UNASSIGN;
      const destName = unassign
        ? 'sem responsável'
        : (facets?.responsaveis.find((person) => person.id === value)?.name ?? 'o vendedor');
      const confirmed = window.confirm(
        bulkAssignConfirmMessage({
          count,
          destName,
          matchFilter: Boolean(matchFilter),
          matched,
          unassign,
        }),
      );
      if (!confirmed) return;
      apply({ responsavelId: unassign ? null : value });
    },
    [apply, count, facets?.responsaveis, matchFilter, matched],
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t border-border bg-subtle px-4">
      <span className="numeric text-sm font-medium text-foreground">
        {formatInteger(count)} selecionado{count === 1 ? '' : 's'}
        {matchFilter ? ' do filtro' : ''}
      </span>

      {overLimit ? (
        <span className="text-xs text-destructive">
          Máximo de {BULK_LIMIT} por operação. Reduza a seleção ou filtre mais.
        </span>
      ) : (
        <>
          <Select
            value=""
            disabled={bulk.isPending}
            onValueChange={(status) => apply({ status: status as LeadStatus })}
          >
            <SelectTrigger className="w-48" aria-label="Aplicar status aos selecionados">
              <SelectValue placeholder="Mudar status" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {leadStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canReassign ? (
            <Select
              value=""
              disabled={bulk.isPending}
              onValueChange={applyAssign}
            >
              <SelectTrigger className="w-48" aria-label="Atribuir responsável aos selecionados">
                <SelectValue placeholder="Atribuir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGN}>Remover responsável</SelectItem>
                {(facets?.responsaveis ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {pageActionsDisabled ? (
            <span className="text-xs text-muted-foreground">
              Tag, retorno e campanha usam a seleção da página.
              {matched > BULK_LIMIT ? (
                <>
                  {' '}
                  Entram os primeiros{' '}
                  <span className="numeric">{formatInteger(BULK_LIMIT)}</span> na ordem{' '}
                  {LEAD_SORT_LABELS[filters?.sort ?? 'createdAt']}.
                </>
              ) : null}
            </span>
          ) : (
            <>
              <Select
                value=""
                disabled={tags.isPending}
                onValueChange={(tagId) =>
                  tags.mutate(
                    { ids: [...selectedIds], tagId, action: 'add' },
                    {
                      onSuccess: (result) =>
                        toast.success(`${result.updated} tag(s) aplicada(s)`),
                      onError: (error) => toast.error(errorMessage(error)),
                    },
                  )
                }
              >
                <SelectTrigger className="w-36" aria-label="Aplicar tag">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  {(facets?.tags ?? []).map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input
                type="date"
                aria-label="Agendar follow-up"
                className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm numeric"
                value={followDate}
                onChange={(event) => setFollowDate(event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!followDate || followUps.isPending}
                onClick={() =>
                  followUps.mutate(
                    { ids: [...selectedIds], scheduledFor: new Date(followDate).toISOString() },
                    {
                      onSuccess: (result) => {
                        toast.success(`${result.updated} follow-up(s) agendado(s)`);
                        onClear();
                      },
                      onError: (error) => toast.error(errorMessage(error)),
                    },
                  )
                }
              >
                Agendar retorno
              </Button>

              {canCreateCampaign ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={campaigns.createFromLeads.isPending}
                  onClick={() =>
                    campaigns.createFromLeads.mutate(
                      {
                        name: `Disparo ${selectedIds.length} contato${selectedIds.length === 1 ? '' : 's'}`,
                        ids: [...selectedIds],
                      },
                      {
                        onSuccess: (campaign) => {
                          toast.success('Rascunho criado com os selecionados.');
                          onClear();
                          router.push(`/campaigns/${campaign.id}`);
                        },
                        onError: (error) => toast.error(errorMessage(error)),
                      },
                    )
                  }
                >
                  Disparar campanha
                </Button>
              ) : null}

              <Button variant="outline" size="sm" asChild>
                <a href={`/api/export?format=csv&ids=${selectedIds.join(',')}`}>Exportar CSV</a>
              </Button>
            </>
          )}
        </>
      )}

      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        <X aria-hidden />
        Limpar seleção
      </Button>
    </div>
  );
}
