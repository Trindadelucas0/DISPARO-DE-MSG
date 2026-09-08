import type { Metadata } from 'next';

import { KanbanScreen } from '@/features/kanban/kanban-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Kanban' };

export default async function KanbanPage() {
  await requireSession();
  return <KanbanScreen />;
}
