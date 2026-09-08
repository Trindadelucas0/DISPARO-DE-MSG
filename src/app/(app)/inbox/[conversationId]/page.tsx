import type { Metadata } from 'next';

import { InboxScreen } from '@/features/inbox/inbox-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Conversa' };

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  await requireSession();
  const { conversationId } = await params;
  return <InboxScreen conversationId={conversationId} />;
}
