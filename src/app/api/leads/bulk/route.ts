import type { NextRequest } from 'next/server';

import { bulkLeadSchema } from '@/features/leads/bulk-schema';
import { requireSession } from '@/lib/auth/rbac';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { handleApi, RateLimitError } from '@/server/api-handler';
import { bulkUpdateLeads } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const limit = await checkRateLimit('leads-bulk', user.id, RATE_LIMITS.writeHeavy);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    const input = bulkLeadSchema.parse(await request.json());
    return bulkUpdateLeads(user, input, {
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
