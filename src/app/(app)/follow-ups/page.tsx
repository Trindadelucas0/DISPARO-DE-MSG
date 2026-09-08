import type { Metadata } from 'next';

import { FollowUpsScreen } from '@/features/follow-ups/follow-ups-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Follow-ups' };

export default async function FollowUpsPage() {
  await requireSession();
  return <FollowUpsScreen />;
}
