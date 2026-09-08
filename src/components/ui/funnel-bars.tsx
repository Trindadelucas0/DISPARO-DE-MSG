import type { LeadStatus } from '@prisma/client';

import { LEAD_STATUS_ORDER, leadStatusCssVar, leadStatusLabel } from '@/constants/lead-status';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface FunnelBarItem {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

export function FunnelBars({
  items,
  activeStatus,
  onSelect,
}: {
  items: readonly FunnelBarItem[];
  activeStatus?: LeadStatus;
  onSelect?: (status: LeadStatus) => void;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <ul className="flex flex-col gap-2 px-4 py-3">
      {LEAD_STATUS_ORDER.map((status) => {
        const row = items.find((item) => item.key === status);
        const count = row?.count ?? 0;
        const width = `${Math.round((count / max) * 100)}%`;
        const active = activeStatus === status;
        return (
          <li key={status}>
            <button
              type="button"
              onClick={() => onSelect?.(status)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-1 py-1 text-left',
                'transition-colors duration-fast hover:bg-subtle',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'active:scale-[0.98]',
                active && 'bg-muted',
              )}
              aria-pressed={active}
              aria-label={`${leadStatusLabel(status)}: ${formatInteger(count)} leads`}
            >
              <span className="w-28 shrink-0 truncate text-sm text-foreground">
                {leadStatusLabel(status)}
              </span>
              <span className="relative h-4 min-w-0 flex-1 rounded-sm bg-muted">
                <span
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{ width, background: leadStatusCssVar(status) }}
                />
              </span>
              <span className="numeric w-12 shrink-0 text-right text-sm text-foreground">
                {formatInteger(count)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FunnelBarsSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3" aria-hidden>
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-1 py-1">
          <div className="h-3 w-28 rounded-sm bg-muted" />
          <div className="h-4 flex-1 rounded-sm bg-muted" />
          <div className="h-3 w-12 rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}
