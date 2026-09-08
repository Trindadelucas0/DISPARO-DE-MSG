'use client';

import type { Role } from '@prisma/client';
import { Command } from 'cmdk';
import { Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { navIcon } from '@/components/shell/icons';
import { CompanyIdentity } from '@/components/ui/record-avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { isPhaseImplemented, navItemsForRole } from '@/constants/navigation';
import { defaultLeadFilters } from '@/features/leads/filter-model';
import { leadsApiUrl } from '@/features/leads/query';
import { ApiError, apiGet, errorMessage } from '@/lib/api-client';
import type { LeadListResult } from '@/server/services/lead.service';

const PALETTE_LIMIT = 8;

/**
 * Paleta de comandos (Cmd/Ctrl+K). Busca empresa na API, navega telas e
 * filtra leads por status. Sem sessão → 401 tratado, sem lista fake.
 */
export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const items = navItemsForRole(role);
  const [query, setQuery] = React.useState('');
  const [companies, setCompanies] = React.useState<LeadListResult['rows']>([]);
  const [companiesError, setCompaniesError] = React.useState<string | null>(null);
  const [companiesLoading, setCompaniesLoading] = React.useState(false);
  const sellerLocked = role === 'USER';

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setCompanies([]);
      setCompaniesError(null);
      setCompaniesLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || sellerLocked) return;
    const term = query.trim();
    if (term.length < 2) {
      setCompanies([]);
      setCompaniesError(null);
      setCompaniesLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCompaniesLoading(true);
      const url = leadsApiUrl({
        ...defaultLeadFilters(),
        search: term,
        limit: PALETTE_LIMIT,
        page: 1,
      });
      void apiGet<LeadListResult>(url, controller.signal)
        .then((result) => {
          setCompanies(result.rows);
          setCompaniesError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setCompanies([]);
          if (error instanceof ApiError && error.status === 401) {
            setCompaniesError('Sessão expirada. Entre de novo para buscar empresas.');
            return;
          }
          setCompaniesError(errorMessage(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setCompaniesLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, sellerLocked]);

  const run = React.useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange],
  );

  const showCompanies = query.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0" hideClose>
        <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
        <DialogDescription className="sr-only">
          Busque uma tela. Admin e gestor também buscam empresa.
        </DialogDescription>

        <Command loop shouldFilter={!showCompanies} className="flex flex-col">
          <div className="flex h-10 items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={sellerLocked ? 'Buscar tela…' : 'Buscar empresa, tela ou status…'}
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="scroll-thin max-h-80 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhum comando corresponde ao que você digitou.
            </Command.Empty>

            {showCompanies && !sellerLocked ? (
              <Command.Group
                heading="Empresas"
                className="[&_[cmdk-group-heading]]:col-label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
              >
                {companiesLoading ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Buscando…</div>
                ) : companiesError ? (
                  <div className="px-2 py-3 text-pretty text-xs text-destructive">{companiesError}</div>
                ) : companies.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    Nenhuma empresa encontrada.
                  </div>
                ) : (
                  companies.map((lead) => (
                    <Command.Item
                      key={lead.id}
                      value={`empresa ${lead.razaoSocial} ${lead.nomeFantasia ?? ''} ${lead.cnpj}`}
                      onSelect={() => run(() => router.push(`/leads/${lead.id}`))}
                      className="flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm data-[selected=true]:bg-muted"
                    >
                      <CompanyIdentity
                        id={lead.id}
                        cnpj={lead.cnpj}
                        razaoSocial={lead.razaoSocial}
                        nomeFantasia={lead.nomeFantasia}
                      />
                    </Command.Item>
                  ))
                )}
              </Command.Group>
            ) : null}

            <Command.Group
              heading="Telas"
              className="[&_[cmdk-group-heading]]:col-label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
            >
              {items.map((item) => {
                const Icon = navIcon(item.icon);
                const ready = isPhaseImplemented(item.phase);
                return (
                  <Command.Item
                    key={item.href}
                    value={`${item.label} ${item.href}`}
                    onSelect={() => run(() => router.push(item.href))}
                    className="flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm data-[selected=true]:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{item.label}</span>
                    {ready ? null : (
                      <span className="ml-auto text-2xs text-muted-foreground">
                        não implementado · fase {item.phase}
                      </span>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>

            {sellerLocked ? null : (
            <Command.Group
              heading="Filtrar leads por status"
              className="[&_[cmdk-group-heading]]:col-label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
            >
              {LEAD_STATUS_ORDER.map((status) => (
                <Command.Item
                  key={status}
                  value={`status ${leadStatusLabel(status)}`}
                  onSelect={() => run(() => router.push(`/leads?status=${status}`))}
                  className="flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm data-[selected=true]:bg-muted"
                >
                  <span className="text-muted-foreground">Status:</span>
                  <span>{leadStatusLabel(status)}</span>
                </Command.Item>
              ))}
            </Command.Group>
            )}

            <Command.Group
              heading="Aparência"
              className="[&_[cmdk-group-heading]]:col-label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
            >
              <Command.Item
                value="alternar tema claro escuro"
                onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
                className="flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm data-[selected=true]:bg-muted"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Moon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span>Alternar para tema {resolvedTheme === 'dark' ? 'claro' : 'escuro'}</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
