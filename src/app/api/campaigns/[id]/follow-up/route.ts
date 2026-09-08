import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { clientIp, checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { BadRequestError, handleApi, RateLimitError } from '@/server/api-handler';
import { startCampaignFollowUp } from '@/server/services/campaign.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const limit = await checkRateLimit('campaign-followup', user.id, RATE_LIMITS.campaignStart);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    void clientIp(request.headers);
    try {
      return await startCampaignFollowUp(user, id);
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw error;
    }
  });
}
