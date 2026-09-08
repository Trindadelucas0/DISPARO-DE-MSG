import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Blocos de leitura da tela de detalhe (wireframe PRD §17).
 *
 * Sem card dentro de card: a seção é delimitada por borda hairline e título,
 * não por caixas aninhadas (regra ux-ui-crm §3).
 */

export function Section({
  title,
  aside,
  children,
  id,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <h2 className="col-label">{title}</h2>
        {aside ? <div className="ml-auto flex items-center gap-1.5">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Par rótulo/valor. `numeric` liga o monoespaçado tabular de dado técnico. */
export function Field({
  label,
  value,
  numeric = false,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  numeric?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', wide && 'col-span-2')}>
      <span className="col-label">{label}</span>
      <span className={cn('break-words text-sm text-foreground', numeric && 'numeric')}>
        {value}
      </span>
    </div>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</div>;
}

/** Lista de valores vindos de array da planilha (sócios, CNAEs secundários). */
export function ValueList({ items, emptyLabel }: { items: readonly string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="text-pretty text-sm text-foreground">
          {item}
        </li>
      ))}
    </ul>
  );
}
