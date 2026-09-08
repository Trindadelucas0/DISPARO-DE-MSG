'use client';

import type { Role } from '@prisma/client';
import { LogOut, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { CommandPalette } from '@/components/shell/command-palette';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RecordAvatar } from '@/components/ui/record-avatar';
import { ROLE_META } from '@/constants/interactions';
import { isTypingTarget } from '@/constants/shortcuts';
import { cn } from '@/lib/utils';

/**
 * Barra superior. Dono do atalho global Cmd/Ctrl+K.
 * O atalho `/` (foco na busca) é implementado pela tela que tem busca,
 * porque só ela sabe qual campo focar.
 */
export function Topbar({
  user,
  onSignOut,
}: {
  user: { name: string; email: string; role: Role };
  onSignOut: () => void | Promise<void>;
}) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Cmd/Ctrl+K vale até com foco em campo de texto (regra ux-ui-crm §6).
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
      <span className="shrink-0 text-xs text-muted-foreground">CRM Prospecção</span>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className={cn(
          'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground',
          'transition-colors duration-fast hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        )}
        aria-label="Abrir paleta de comandos"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {user.role === 'USER' ? 'Buscar tela…' : 'Buscar empresa, tela ou status…'}
        </span>
        <kbd className="numeric ml-auto rounded-sm border border-border px-1 text-2xs">Ctrl K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            mounted && resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'
          }
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {mounted && resolvedTheme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Conta de ${user.name}`}>
              <RecordAvatar name={user.name} seed={user.email} size="sm" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Sessão</DropdownMenuLabel>
            <div className="px-2 pb-1.5">
              <p className="truncate text-sm text-foreground">{user.name}</p>
              <p className="truncate text-sm text-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">{ROLE_META[user.role].label}</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                {ROLE_META[user.role].description}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void onSignOut();
              }}
              destructive
            >
              <LogOut aria-hidden />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={user.role} />
    </header>
  );
}

/** Foco na busca com `/`. Usado pelas telas que têm campo de busca. */
export function useFocusSearchShortcut(ref: React.RefObject<HTMLInputElement | null>): void {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || isTypingTarget(event.target)) return;
      event.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ref]);
}
