import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';

export function KpiStat({
  label,
  value,
  hint,
  suffix,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value: number | null;
  hint?: string;
  suffix?: string;
  tone?: 'warning' | 'destructive';
  active?: boolean;
  onClick?: () => void;
}) {
  const alert = Boolean(tone && value !== null && value > 0);
  const className = cn(
    'flex flex-col justify-center gap-0.5 border-b border-r border-border px-4 py-3 text-left last:border-r-0 lg:border-b-0',
    onClick &&
      'transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.98]',
    active && 'bg-muted',
  );

  const body = (
    <>
      <span
        className={cn(
          'numeric text-xl font-semibold',
          alert ? 'text-destructive' : 'text-foreground',
        )}
      >
        {value === null ? '—' : formatInteger(value)}
        {suffix && value !== null ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
      <span className="col-label flex items-center gap-1.5">
        {alert ? (
          <span
            className={cn(
              'size-1.5 rounded-full',
              tone === 'destructive' ? 'bg-destructive' : 'bg-warning',
            )}
            aria-hidden
          />
        ) : null}
        {label}
      </span>
      {hint ? <span className="text-pretty text-xs text-muted-foreground">{hint}</span> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={hint} aria-pressed={active}>
        {body}
      </button>
    );
  }

  return (
    <div className={className} title={hint}>
      {body}
    </div>
  );
}

export function KpiStatSkeleton({ count = 8 }: { count?: number }) {
  const layout =
    count === 8
      ? 'grid grid-cols-2 border-b border-border sm:grid-cols-4 xl:grid-cols-8'
      : count === 4
        ? 'grid grid-cols-2 border-b border-border lg:grid-cols-4'
        : count === 6
          ? 'grid grid-cols-2 border-b border-border lg:grid-cols-6'
          : 'grid grid-cols-2 border-b border-border lg:grid-cols-5';
  return (
    <div className={layout} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex h-20 flex-col justify-center gap-1 border-r border-border px-4 last:border-r-0"
        >
          <div className="h-5 w-12 rounded-sm bg-muted" />
          <div className="h-3 w-20 rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}
