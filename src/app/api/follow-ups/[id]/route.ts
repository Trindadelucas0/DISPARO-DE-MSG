import type { NextRequest } from 'next/server';

import { patchFollowUpSchema } from '@/features/interactions/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { handleApi } from '@/server/api-handler';
import { patchFollowUp } from '@/server/services/follow-up.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const input = patchFollowUpSchema.parse(await request.json());
    return patchFollowUp(user, id, input, {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
