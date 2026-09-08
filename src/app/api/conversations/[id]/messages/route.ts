import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import {
  getConversationMessages,
  sendConversationMessage,
  sendMessageSchema,
} from '@/server/services/conversation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    return getConversationMessages(user, id);
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const body = sendMessageSchema.parse(await request.json());
    return sendConversationMessage(user, id, body);
  });
}
