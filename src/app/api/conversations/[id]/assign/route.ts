import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { assignConversation } from '@/server/services/conversation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  toUserId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    return assignConversation(user, id, body.toUserId, body.note);
  });
}
