import type { NextRequest } from 'next/server';

import { patchUserSchema } from '@/features/reports/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { patchAppUser } from '@/server/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const input = patchUserSchema.parse(await request.json());
    return patchAppUser(user, id, input);
  });
}
