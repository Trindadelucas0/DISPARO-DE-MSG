import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { autoReplyConfigSchema, getCampaignAutoReply, saveCampaignAutoReply } from '@/server/services/campaign-auto-reply.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => getCampaignAutoReply(await requireSession(), (await context.params).id));
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const input = autoReplyConfigSchema.parse(await request.json());
    return saveCampaignAutoReply(await requireSession(), (await context.params).id, input);
  });
}
