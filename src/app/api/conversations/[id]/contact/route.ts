import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { handleApi, RateLimitError } from '@/server/api-handler';
import { attachConversationContact } from '@/server/services/conversation.service';
import { manualLeadSchema } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const limit = await checkRateLimit('conversation-contact', user.id, RATE_LIMITS.writeHeavy);
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
    const input = manualLeadSchema.parse(await request.json());
    return attachConversationContact(user, id, input);
  });
}
