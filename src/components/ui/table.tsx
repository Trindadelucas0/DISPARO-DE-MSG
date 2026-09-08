import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Tabela densa do sistema. Linha de dados 32px, cabeçalho 36px
 * (regra ux-ui-crm §3). Não há zebra: o separador é a borda hairline.
 */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full border-separate border-spacing-0 text-sm', className)}
      {...props}
    />
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-10 bg-muted', className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({
  className,
  selected = false,
  focused = false,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean; focused?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      data-focused={focused || undefined}
      className={cn(
        'h-8 transition-colors duration-fast',
        'hover:bg-muted',
        selected && 'bg-primary/[0.07]',
        focused && 'bg-primary/[0.11]',
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  align = 'left',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'col-label h-9 border-b border-border px-2 font-medium',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('h-8 border-b border-border px-2 align-middle', className)}
      {...props}
    />
  );
}

/** Container com rolagem própria; a tabela nunca usa largura máxima centralizada. */
export function TableScroll({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('scroll-thin min-h-0 flex-1 overflow-auto', className)}
      {...props}
    />
  );
}
