import type { Metadata } from 'next';

import { SellerSupervisionScreen } from '@/features/admin/seller-supervision-screen';
import { ForbiddenState } from '@/components/ui/data-state';
import { canSuperviseInbox, requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Vendedor' };

export default async function SellerAtendimentoPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await requireSession();
  if (!canSuperviseInbox(user)) {
    return (
      <ForbiddenState reason="Somente gestor ou administrador acessa a supervisão de atendimento." />
    );
  }
  const { userId } = await params;
  return <SellerSupervisionScreen userId={userId} />;
}
