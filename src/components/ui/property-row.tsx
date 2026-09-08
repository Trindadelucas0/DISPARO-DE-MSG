import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Linha de propriedade: rótulo à esquerda, valor à direita. Drawer e Settings. */
export function PropertyRow({
  label,
  children,
  numeric = false,
}: {
  label: string;
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 border-b border-border last:border-b-0">
      <span className="col-label shrink-0">{label}</span>
      <div
        className={cn(
          'min-w-0 truncate text-right text-sm text-foreground',
          numeric && 'numeric',
        )}
      >
        {children}
      </div>
    </div>
  );
}
