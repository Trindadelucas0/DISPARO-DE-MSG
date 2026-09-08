'use client';

import type { Role } from '@prisma/client';
import * as React from 'react';

import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { SessionUserProvider } from '@/features/auth/session-context';
import { EventsBridge } from '@/features/events/events-bridge';

/**
 * Casca da aplicação: sidebar fixa + barra superior + área de trabalho que usa
 * a largura inteira do monitor. Sem `max-w-*` centralizado (regra ux-ui-crm §3).
 */
export function AppShell({
  user,
  onSignOut,
  children,
}: {
  user: { name: string; email: string; role: Role };
  onSignOut: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <SessionUserProvider user={user}>
      <EventsBridge />
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <Sidebar role={user.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} onSignOut={onSignOut} />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
        </div>
      </div>
    </SessionUserProvider>
  );
}

/** Cabeçalho de tela operacional: título + ações à direita, sem hero. */
export function PageHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {count ? <span className="numeric text-sm text-muted-foreground">{count}</span> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
