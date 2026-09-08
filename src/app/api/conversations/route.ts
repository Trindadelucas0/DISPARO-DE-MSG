import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import {
  conversationListSchema,
  listConversations,
} from '@/server/services/conversation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const input = conversationListSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return listConversations(user, input);
  });
}
