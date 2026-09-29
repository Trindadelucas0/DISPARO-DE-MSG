import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import {
  getConversation,
  markConversationRead,
  removeConversation,
} from '@/server/services/conversation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const conversation = await getConversation(user, id);
    await markConversationRead(user, id);
    return conversation;
  });
}

export async function PATCH(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    return markConversationRead(user, id);
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    return removeConversation(user, id);
  });
}
