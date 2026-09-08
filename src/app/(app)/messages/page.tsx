import type { Metadata } from 'next';

import { MessagesScreen } from '@/features/messages/messages-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Mensagens' };

export default async function MessagesPage() {
  const user = await requireSession();
  return <MessagesScreen role={user.role} />;
}
