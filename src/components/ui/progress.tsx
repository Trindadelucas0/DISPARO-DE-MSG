import { cn } from '@/lib/utils';

/**
 * Barra de progresso determinada. Só é usada onde existe total conhecido
 * (job de importação). Não é indicador decorativo de "carregando".
 */
export function Progress({
  value,
  total,
  label,
  className,
}: {
  value: number;
  total: number;
  label: string;
  className?: string;
}) {
  const safeTotal = total > 0 ? total : 0;
  const percent = safeTotal === 0 ? 0 : Math.min(100, Math.round((value / safeTotal) * 100));

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="numeric text-xs text-foreground">
          {value.toLocaleString('pt-BR')} / {safeTotal.toLocaleString('pt-BR')} ({percent}%)
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-sm bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-label={label}
      >
        <div
          className="h-full rounded-sm bg-primary transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
