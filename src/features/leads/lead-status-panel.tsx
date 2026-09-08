'use client';

import type { LeadStatus, Role } from '@prisma/client';
import * as React from 'react';
import { toast } from 'sonner';

import { ResultBadge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { LEAD_STATUS_ORDER, leadStatusLabel, leadStatusMeta } from '@/constants/lead-status';
import { Section } from '@/features/leads/lead-fields';
import { useLeadFacets, useUpdateLead } from '@/features/leads/use-leads';
import { errorMessage } from '@/lib/api-client';
import { toDateInputValue } from '@/lib/format';
import type { SerializedLeadDetail } from '@/server/services/lead.service';

const UNASSIGN = '__unassign__';

/**
 * Status, próximo contato e responsável. Salvam na hora, sem botão de
 * confirmar: são as três decisões que o vendedor toma dezenas de vezes por dia.
 */
export function LeadStatusPanel({
  lead,
  role,
}: {
  lead: SerializedLeadDetail;
  role: Role;
}) {
  const update = useUpdateLead(lead.id);
  const facets = useLeadFacets();
  const canReassign = role === 'ADMIN' || role === 'MANAGER';
  const meta = leadStatusMeta(lead.status);

  const save = React.useCallback(
    (patch: Parameters<typeof update.mutate>[0], successMessage: string) => {
      update.mutate(patch, {
        onSuccess: () => toast.success(successMessage),
        onError: (error) => toast.error(errorMessage(error)),
      });
    },
    [update],
  );

  return (
    <Section title="Situação no funil">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="lead-status">Status</Label>
          <Select
            value={lead.status}
            disabled={!lead.canEdit || update.isPending}
            onValueChange={(value) =>
              save(
                { status: value as LeadStatus },
                `Status alterado para ${leadStatusLabel(value as LeadStatus)}.`,
              )
            }
          >
            <SelectTrigger id="lead-status">
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
          <span className="text-2xs text-muted-foreground">{meta.description}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="col-label">Última interação</span>
          <ResultBadge result={lead.lastInteractionResult} />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="lead-next-contact">Próximo contato</Label>
          <Input
            id="lead-next-contact"
            type="date"
            numeric
            disabled={!lead.canEdit || update.isPending}
            defaultValue={toDateInputValue(lead.nextContactAt)}
            onChange={(event) => {
              const value = event.target.value;
              save(
                { nextContactAt: value === '' ? null : new Date(value).toISOString() },
                value === '' ? 'Próximo contato removido.' : 'Próximo contato agendado.',
              );
            }}
          />
          {meta.terminal ? (
            <span className="text-2xs text-muted-foreground">
              Status terminal: agendar novo contato aqui é possível, mas fora do fluxo normal.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="lead-owner">Responsável</Label>
          {canReassign ? (
            <Select
              value={lead.responsavelId ?? UNASSIGN}
              disabled={update.isPending}
              onValueChange={(value) =>
                save(
                  { responsavelId: value === UNASSIGN ? null : value },
                  value === UNASSIGN ? 'Responsável removido.' : 'Responsável atualizado.',
                )
              }
            >
              <SelectTrigger id="lead-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGN}>Sem responsável</SelectItem>
                {(facets.data?.responsaveis ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-foreground">
              {lead.responsavelNome ?? 'Sem responsável'}
            </span>
          )}
        </div>
      </div>
    </Section>
  );
}
