import type { NextRequest } from 'next/server';

import { dashboardFiltersSchema } from '@/features/dashboard/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { getDashboard } from '@/server/services/metrics.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const filters = dashboardFiltersSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return getDashboard(user, { ...filters, page: 1, limit: 50, sort: 'createdAt', dir: 'desc' });
  });
}
