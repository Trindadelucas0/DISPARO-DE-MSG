import type { NextRequest } from 'next/server';
import { CampaignStatus } from '@prisma/client';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import {
  campaignDraftSchema,
  createCampaign,
  getCampaigns,
} from '@/server/services/campaign.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const status = request.nextUrl.searchParams.get('status');
    const parsed =
      status && Object.values(CampaignStatus).includes(status as CampaignStatus)
        ? (status as CampaignStatus)
        : undefined;
    return getCampaigns(user, parsed);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const body = campaignDraftSchema.parse(await request.json());
    return createCampaign(user, body.name);
  });
}
