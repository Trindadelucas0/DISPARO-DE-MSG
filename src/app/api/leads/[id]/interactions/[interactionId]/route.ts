import type { NextRequest } from 'next/server';

import { createInteractionSchema } from '@/features/interactions/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { handleApi } from '@/server/api-handler';
import { patchInteraction } from '@/server/services/interaction.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; interactionId: string }> },
) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id, interactionId } = await context.params;
    const input = createInteractionSchema.parse(await request.json());
    return patchInteraction(user, id, interactionId, input, {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
