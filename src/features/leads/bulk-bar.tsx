'use client';

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
import { BULK_LIMIT } from '@/features/leads/bulk-schema';
import { useBulkFollowUpLeads, useBulkTagLeads, useBulkUpdateLeads } from '@/features/leads/use-leads';
import { errorMessage } from '@/lib/api-client';
import type { LeadFacets } from '@/server/services/lead.service';

const UNASSIGN = '__unassign__';

/**
 * Barra de ações em lote. Aparece apenas com seleção ativa e informa quantos
 * registros a operação alcançou — inclusive quando o papel do usuário
 * bloqueou parte deles.
 */
export function BulkBar({
  selectedIds,
  facets,
  canReassign,
  canCreateCampaign,
  onClear,
}: {
  selectedIds: readonly string[];
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
  const overLimit = selectedIds.length > BULK_LIMIT;
  const [followDate, setFollowDate] = React.useState('');

  const apply = React.useCallback(
    (input: { status?: string; responsavelId?: string | null }) => {
      bulk.mutate(
        { ids: [...selectedIds], ...input },
        {
          onSuccess: (result) => {
            const parts = [`${result.updated} lead(s) atualizado(s)`];
            if (result.skipped > 0) {
              parts.push(`${result.skipped} fora do seu escopo de acesso`);
            }
            toast.success(parts.join(' · '));
            onClear();
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      );
    },
    [bulk, onClear, selectedIds],
  );

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t border-border bg-subtle px-4">
      <span className="numeric text-sm font-medium text-foreground">
        {selectedIds.length} selecionado{selectedIds.length === 1 ? '' : 's'}
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
            onValueChange={(status) => apply({ status })}
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
              onValueChange={(value) =>
                apply({ responsavelId: value === UNASSIGN ? null : value })
              }
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

      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        <X aria-hidden />
        Limpar seleção
      </Button>
    </div>
  );
}
