import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DashboardScreen } from '@/features/dashboard/dashboard-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  await requireSession();
  return (
    <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Carregando dashboard…</div>}>
      <DashboardScreen />
    </Suspense>
  );
}
