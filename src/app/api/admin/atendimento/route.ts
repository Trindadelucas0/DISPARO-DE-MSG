import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { getAtendimentoOverview } from '@/server/services/supervision.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleApi(async () => {
    const user = await requireSession();
    return getAtendimentoOverview(user);
  });
}
