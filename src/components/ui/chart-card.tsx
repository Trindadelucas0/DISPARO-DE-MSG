import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r lg:last:border-r-0',
        className,
      )}
    >
      <h2 className="col-label border-b border-border px-4 py-2">{title}</h2>
      <div className="aspect-[16/9] min-h-48 p-2">{children}</div>
    </section>
  );
}
