'use client';

import type { InteractionResult, InteractionType } from '@prisma/client';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { INTERACTION_RESULT_META, OPERATIONAL_RESULTS } from '@/constants/interactions';
import { useRecordInteraction } from '@/features/contacts/use-contacts';
import { errorMessage } from '@/lib/api-client';

/**
 * Registrar resultado da interação. Mesma mutation dos 7 botões antigos:
 * POST /api/leads/:id/interactions via useRecordInteraction.
 */
export function RegisterResultPopover({
  leadId,
  type,
  disabled = false,
}: {
  leadId: string;
  type: InteractionType;
  disabled?: boolean;
}) {
  const record = useRecordInteraction(leadId);

  const apply = (result: InteractionResult) => {
    record.mutate(
      { type, result },
      {
        onSuccess: () => toast.success(`${INTERACTION_RESULT_META[result].label} registrado.`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || record.isPending}>
          Registrar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {OPERATIONAL_RESULTS.map((result) => (
          <button
            key={result}
            type="button"
            disabled={record.isPending}
            onClick={() => apply(result)}
            className="flex h-7 w-full items-center rounded-sm px-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {INTERACTION_RESULT_META[result].label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
