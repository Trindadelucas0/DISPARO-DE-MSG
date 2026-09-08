import { Construction } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Estado honesto para funcionalidade de fase futura.
 *
 * Existe para que a navegação fique completa sem nenhum botão que finge
 * funcionar (regra ux-ui-crm §8). Diz o que é e em que fase chega.
 */
export function NotImplemented({
  title,
  phase,
  what,
  dependsOn,
}: {
  title: string;
  phase: number;
  what: string;
  dependsOn?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <Construction className="size-5 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Não implementado — chega na fase {phase}
        </p>
      </div>
      <p className="max-w-lg text-xs text-muted-foreground">{what}</p>
      {dependsOn ? (
        <p className="max-w-lg text-xs text-muted-foreground">Depende de: {dependsOn}</p>
      ) : null}
      <Button variant="outline" size="sm" asChild className="mt-1">
        <Link href="/leads">Ir para Leads</Link>
      </Button>
    </div>
  );
}

/** Bloco inline "não implementado" para uma seção dentro de uma tela que existe. */
export function NotImplementedSection({
  title,
  phase,
  what,
}: {
  title: string;
  phase: number;
  what: string;
}) {
  return (
    <section className="rounded-md border border-dashed border-border px-3 py-4">
      <div className="flex items-center gap-2">
        <Construction className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <span className="ml-auto text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Fase {phase}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{what}</p>
    </section>
  );
}
