import type { Metadata } from 'next';
import { Suspense } from 'react';

import { TableSkeleton } from '@/components/ui/data-state';
import { LEAD_COLUMN_WIDTHS } from '@/features/leads/columns';
import { LeadsScreen } from '@/features/leads/leads-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage() {
  // O recorte real por papel é aplicado na API; aqui o papel só decide quais
  // controles aparecem.
  const user = await requireSession();

  return (
    // `useSearchParams` (filtros na URL) exige limite de Suspense.
    <Suspense fallback={<TableSkeleton rows={16} widths={LEAD_COLUMN_WIDTHS} />}>
      <LeadsScreen role={user.role} />
    </Suspense>
  );
}
