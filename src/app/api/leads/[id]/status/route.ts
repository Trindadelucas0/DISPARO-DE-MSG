import type { NextRequest } from 'next/server';

import { leadStatusPatchSchema } from '@/features/dashboard/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { handleApi } from '@/server/api-handler';
import { changeLeadStatus } from '@/server/services/kanban.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const input = leadStatusPatchSchema.parse(await request.json());
    return changeLeadStatus(user, id, input.status, {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
