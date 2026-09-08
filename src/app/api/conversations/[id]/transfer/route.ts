import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { transferConversation, transferSchema } from '@/server/services/conversation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const body = transferSchema.parse(await request.json());
    return transferConversation(user, id, body);
  });
}
