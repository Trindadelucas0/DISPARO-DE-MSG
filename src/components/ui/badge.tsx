import type { ConversationStatus, InteractionResult, LeadStatus } from '@prisma/client';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { leadStatusBadgeClass, leadStatusDotClass, leadStatusMeta } from '@/constants/lead-status';
import {
  conversationStatusBadgeClass,
  conversationStatusDotClass,
  conversationStatusLabel,
  CONVERSATION_STATUS_META,
} from '@/constants/conversation';
import {
  interactionResultBadgeClass,
  interactionResultDotClass,
  interactionResultLabel,
  INTERACTION_RESULT_META,
} from '@/constants/interactions';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted text-muted-foreground',
        outline: 'border-input bg-transparent text-muted-foreground',
        accent: 'border-primary/30 bg-primary/10 text-primary',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * Badge do funil. Cor é redundância: o rótulo textual está sempre presente.
 */
export function StatusBadge({
  status,
  short = false,
  className,
}: {
  status: LeadStatus;
  short?: boolean;
  className?: string;
}) {
  const meta = leadStatusMeta(status);
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium',
        leadStatusBadgeClass(status),
        className,
      )}
      title={meta.description}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', leadStatusDotClass(status))} aria-hidden />
      {short ? meta.shortLabel : meta.label}
    </span>
  );
}

/** Badge de atendimento. Paleta `--conversation-*`, nunca a do funil. */
export function ConversationBadge({
  status,
  className,
}: {
  status: ConversationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium',
        conversationStatusBadgeClass(status),
        className,
      )}
      title={CONVERSATION_STATUS_META[status].description}
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', conversationStatusDotClass(status))}
        aria-hidden
      />
      {conversationStatusLabel(status)}
    </span>
  );
}

/**
 * Badge do resultado da última interação. Paleta `--result-*`, nunca a do funil.
 */
export function ResultBadge({
  result,
  className,
}: {
  result: InteractionResult | null | undefined;
  className?: string;
}) {
  if (!result) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium',
        interactionResultBadgeClass(result),
        className,
      )}
      title={INTERACTION_RESULT_META[result].label}
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', interactionResultDotClass(result))}
        aria-hidden
      />
      {interactionResultLabel(result)}
    </span>
  );
}

/**
 * Chip de tag. Usa apenas neutro e o acento único — cores semânticas pertencem
 * ao funil e ao resultado de interação.
 */
export function TagChip({ name, accent = false }: { name: string; accent?: boolean }) {
  return <Badge variant={accent ? 'accent' : 'outline'}>{name}</Badge>;
}
