import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { RATE_LIMITS, checkRateLimit, clientIp } from '@/lib/rate-limit';
import { RateLimitError, handleApi } from '@/server/api-handler';
import { importWhatsAppContacts } from '@/server/services/whatsapp-contacts.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const limit = await checkRateLimit(
      'import',
      `${user.id}:${clientIp(request.headers)}`,
      RATE_LIMITS.import,
    );
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const { id } = await context.params;
    return importWhatsAppContacts(user, id);
  });
}
