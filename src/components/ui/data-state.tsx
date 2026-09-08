import { AlertTriangle, Inbox, Lock, RotateCcw } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Os quatro estados obrigatórios de todo componente de dados
 * (regra ux-ui-crm §5). Componente que lê dados e não usa isto não passa
 * na revisão da fase.
 */

function Frame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-10 text-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Estado 2 — vazio. Frase do que aconteceu + a ação que resolve. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Frame className={className}>
      <Inbox className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-base font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </Frame>
  );
}

/** Estado 3 — erro. Causa legível + botão que refaz a operação. */
export function ErrorState({
  title = 'Não foi possível carregar',
  cause,
  onRetry,
  className,
}: {
  title?: string;
  cause: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Frame className={className}>
      <AlertTriangle className="size-5 text-destructive" aria-hidden />
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{cause}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCcw aria-hidden />
          Tentar novamente
        </Button>
      ) : null}
    </Frame>
  );
}

/** Estado 4 — sem permissão. O motivo, não um 403 mudo. */
export function ForbiddenState({ reason, className }: { reason: string; className?: string }) {
  return (
    <Frame className={className}>
      <Lock className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-base font-medium text-foreground">Sem permissão</p>
      <p className="max-w-md text-xs text-muted-foreground">{reason}</p>
    </Frame>
  );
}

/**
 * Estado 1 — carregando. Skeleton com a geometria real do conteúdo.
 * `widths` recebe as larguras das colunas para o skeleton ter o mesmo desenho
 * da tabela final. Barra cinza genérica é proibida.
 */
export function TableSkeleton({
  rows = 12,
  widths,
  className,
}: {
  rows?: number;
  widths: readonly string[];
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-border', className)} aria-hidden>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex h-8 items-center gap-2 px-2">
          {widths.map((width, cellIndex) => (
            <div
              key={cellIndex}
              className="h-3 rounded-sm bg-muted"
              style={{ width, opacity: 1 - rowIndex * 0.045 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton de bloco de campos (tela de detalhe), com a altura real dos campos. */
export function FieldsSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1">
          <div className="h-3 w-24 rounded-sm bg-muted" />
          <div className="h-8 w-full rounded-md border border-border bg-subtle" />
        </div>
      ))}
    </div>
  );
}
