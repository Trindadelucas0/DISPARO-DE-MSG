import type { Metadata } from 'next';

import { CampaignsScreen } from '@/features/campaigns/campaigns-screen';
import { canManageCampaigns, requireSession } from '@/lib/auth/rbac';
import { ForbiddenState } from '@/components/ui/data-state';

export const metadata: Metadata = { title: 'Campanhas' };

export default async function CampaignsPage() {
  const user = await requireSession();
  if (!canManageCampaigns(user)) {
    return (
      <ForbiddenState reason="Somente gestor ou administrador cria e acompanha campanhas." />
    );
  }
  return <CampaignsScreen />;
}
