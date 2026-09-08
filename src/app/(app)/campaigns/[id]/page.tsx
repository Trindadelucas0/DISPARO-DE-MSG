import type { Metadata } from 'next';

import { CampaignDetailScreen } from '@/features/campaigns/campaign-detail-screen';
import { ForbiddenState } from '@/components/ui/data-state';
import { canManageCampaigns, requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Campanha' };

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSession();
  if (!canManageCampaigns(user)) {
    return (
      <ForbiddenState reason="Somente gestor ou administrador acessa campanhas." />
    );
  }
  const { id } = await params;
  return <CampaignDetailScreen id={id} />;
}
