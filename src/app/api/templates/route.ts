import type { NextRequest } from 'next/server';

import { templateWriteSchema } from '@/features/messages/schema';
import { requireStaff } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { createMessageTemplate, getTemplates } from '@/server/services/template.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    await requireStaff();
    const activeOnly = request.nextUrl.searchParams.get('active') === '1';
    return getTemplates(activeOnly);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireStaff();
    const input = templateWriteSchema.parse(await request.json());
    return createMessageTemplate(user, input);
  });
}
