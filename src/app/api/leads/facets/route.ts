import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { getLeadFacets } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Valores distintos para os seletores de filtro da tela /leads. */
export async function GET() {
  return handleApi(async () => {
    const user = await requireSession();
    return getLeadFacets(user);
  });
}
