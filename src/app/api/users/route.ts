import type { NextRequest } from 'next/server';

import { createUserSchema } from '@/features/reports/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { createAppUser, getUsers } from '@/server/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleApi(async () => {
    const user = await requireSession();
    return getUsers(user);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const input = createUserSchema.parse(await request.json());
    return createAppUser(user, input);
  });
}
