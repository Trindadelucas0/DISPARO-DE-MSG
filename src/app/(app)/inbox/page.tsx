import type { Metadata } from 'next';

import { InboxScreen } from '@/features/inbox/inbox-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage() {
  await requireSession();
  return <InboxScreen />;
}
