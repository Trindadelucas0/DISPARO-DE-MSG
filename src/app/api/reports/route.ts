import type { NextRequest } from 'next/server';

import { dashboardFiltersSchema } from '@/features/dashboard/schema';
import { reportsRangeSchema } from '@/features/reports/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { getReports } from '@/server/services/reports.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = dashboardFiltersSchema.parse(params);
    const range = reportsRangeSchema.parse(params);
    return getReports(
      user,
      { ...filters, page: 1, limit: 50, sort: 'createdAt', dir: 'desc' },
      range,
    );
  });
}
