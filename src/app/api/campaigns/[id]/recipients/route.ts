import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { clientIp, checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { BadRequestError, handleApi, RateLimitError } from '@/server/api-handler';
import {
  addCampaignRecipients,
  addRecipientsSchema,
  getCampaignRecipients,
} from '@/server/services/campaign.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
    const status = request.nextUrl.searchParams.get('status') ?? undefined;
    return getCampaignRecipients(user, id, page, limit, status);
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const limit = await checkRateLimit('campaign-recipients-add', user.id, RATE_LIMITS.campaignStart);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    void clientIp(request.headers);
    const body = addRecipientsSchema.parse(await request.json());
    try {
      return await addCampaignRecipients(user, id, body.count);
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw error;
    }
  });
}
