import type { Metadata } from 'next';

import { CampaignRecipientsScreen } from '@/features/campaigns/campaign-recipients-screen';
import { ForbiddenState } from '@/components/ui/data-state';
import { canManageCampaigns, requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Destinatários' };

export default async function CampaignRecipientsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSession();
  if (!canManageCampaigns(user)) {
    return (
      <ForbiddenState reason="Somente gestor ou administrador acessa destinatários." />
    );
  }
  const { id } = await params;
  return <CampaignRecipientsScreen id={id} />;
}
