import type { Metadata } from 'next';

import { ReportsScreen } from '@/features/reports/reports-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Relatórios' };

export default async function ReportsPage() {
  await requireSession();
  return <ReportsScreen />;
}
