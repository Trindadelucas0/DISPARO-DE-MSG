'use client';

import type { InteractionResult, InteractionType } from '@prisma/client';
import * as React from 'react';
import { toast } from 'sonner';

import { ResultBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/data-state';
import { Textarea } from '@/components/ui/input';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import {
  INTERACTION_RESULT_META,
  INTERACTION_RESULT_ORDER,
  INTERACTION_TYPE_META,
  INTERACTION_TYPE_ORDER,
} from '@/constants/interactions';
import { useInteractions, useRecordInteraction } from '@/features/contacts/use-contacts';
import { Section } from '@/features/leads/lead-fields';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';

const NONE = '__none__';

export function InteractionTimeline({ leadId, canEdit }: { leadId: string; canEdit: boolean }) {
  const query = useInteractions(leadId);
  const record = useRecordInteraction(leadId);
  const [type, setType] = React.useState<InteractionType>('WHATSAPP');
  const [result, setResult] = React.useState<InteractionResult | typeof NONE>(NONE);
  const [content, setContent] = React.useState('');
  const [scheduledFor, setScheduledFor] = React.useState('');

  const rows = (query.data as Array<{
    id: string;
    userName: string;
    type: InteractionType;
    result: InteractionResult | null;
    content: string | null;
    occurredAt: string;
  }> | undefined) ?? [];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    record.mutate(
      {
        type,
        result: result === NONE ? null : result,
        content: content || null,
        scheduledFor: scheduledFor || null,
      },
      {
        onSuccess: () => {
          toast.success('Interação registrada.');
          setContent('');
          setScheduledFor('');
          setResult(NONE);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <Section title="Histórico de interações" id="historico">
      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-10 rounded-sm bg-muted" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          cause={query.error instanceof Error ? query.error.message : 'Erro.'}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma interação ainda"
          description="Registre o primeiro contato abaixo. Sem isso o dashboard e os relatórios ficam zerados de propósito."
          className="py-4"
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-border pb-2 last:border-b-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">{INTERACTION_TYPE_META[row.type].label}</span>
                {row.result ? <ResultBadge result={row.result} /> : null}
                <span className="numeric ml-auto text-2xs text-muted-foreground">
                  {formatDateTime(row.occurredAt)}
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">{row.userName}</p>
              {row.content ? <p className="mt-0.5 text-pretty text-xs">{row.content}</p> : null}
            </li>
          ))}
        </ol>
      )}

      {canEdit ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label>Canal</Label>
              <Select value={type} onValueChange={(value) => setType(value as InteractionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPE_ORDER.map((value) => (
                    <SelectItem key={value} value={value}>
                      {INTERACTION_TYPE_META[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Resultado</Label>
              <Select
                value={result}
                onValueChange={(value) =>
                  setResult(value === NONE ? NONE : (value as InteractionResult))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem resultado</SelectItem>
                  {INTERACTION_RESULT_ORDER.map((value) => (
                    <SelectItem key={value} value={value}>
                      {INTERACTION_RESULT_META[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea
            rows={3}
            placeholder="Anotação do contato"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="next-fu">Agendar retorno</Label>
            <input
              id="next-fu"
              type="datetime-local"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm numeric"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" size="sm" loading={record.isPending}>
            Registrar contato
          </Button>
        </form>
      ) : null}
    </Section>
  );
}
