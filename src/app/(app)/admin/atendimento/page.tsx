import type { Metadata } from 'next';

import { SupervisionScreen } from '@/features/admin/supervision-screen';
import { ForbiddenState } from '@/components/ui/data-state';
import { canSuperviseInbox, requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Supervisão' };

export default async function AtendimentoPage() {
  const user = await requireSession();
  if (!canSuperviseInbox(user)) {
    return (
      <ForbiddenState reason="Somente gestor ou administrador acessa a supervisão de atendimento." />
    );
  }
  return <SupervisionScreen />;
}
