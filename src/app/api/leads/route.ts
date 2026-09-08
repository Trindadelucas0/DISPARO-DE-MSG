import type { NextRequest } from 'next/server';

import { leadFiltersSchema } from '@/features/leads/schema';
import { requireSession } from '@/lib/auth/rbac';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { handleApi, RateLimitError } from '@/server/api-handler';
import { createManualLead, listLeads, manualLeadSchema } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const filters = leadFiltersSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return listLeads(user, filters);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const limit = await checkRateLimit('lead-manual', user.id, RATE_LIMITS.writeHeavy);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    const input = manualLeadSchema.parse(await request.json());
    return createManualLead(user, input);
  });
}
