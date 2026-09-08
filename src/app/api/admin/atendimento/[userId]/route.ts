import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { getSellerAtendimentoDetail } from '@/server/services/supervision.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { userId } = await context.params;
    return getSellerAtendimentoDetail(user, userId);
  });
}
