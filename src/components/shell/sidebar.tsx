'use client';

import type { Role } from '@prisma/client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { navIcon } from '@/components/shell/icons';
import { isPhaseImplemented, navItemsForRole } from '@/constants/navigation';
import { cn } from '@/lib/utils';

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <nav
      aria-label="Navegação principal"
      className="flex w-sidebar shrink-0 flex-col border-r border-border bg-subtle"
    >
      <ul className="flex flex-col gap-0.5 p-2">
        {items.map((item, index) => {
          const Icon = navIcon(item.icon);
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const ready = isPhaseImplemented(item.phase);
          const previous = items[index - 1];
          const sectionStart = previous && previous.section !== item.section;

          return (
            <li key={item.href} className={sectionStart ? 'mt-1 border-t border-border pt-1' : undefined}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {active ? (
                  <span
                    className="absolute inset-y-1 left-0 w-0.5 rounded-sm bg-primary"
                    aria-hidden
                  />
                ) : null}
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
                {ready ? null : (
                  <span className="ml-auto shrink-0 text-2xs tabular text-muted-foreground">
                    F{item.phase}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
