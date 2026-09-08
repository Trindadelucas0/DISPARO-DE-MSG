import type { NextRequest } from 'next/server';

import { leadFiltersSchema } from '@/features/leads/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { countCampaignAudience } from '@/server/services/campaign.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const excludeOptOut = params.excludeOptOut !== 'false';
    const filters = leadFiltersSchema.parse(params);
    return countCampaignAudience(user, filters, excludeOptOut);
  });
}
