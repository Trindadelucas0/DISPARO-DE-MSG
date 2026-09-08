import type { Metadata } from 'next';
import { Suspense } from 'react';

import { FieldsSkeleton } from '@/components/ui/data-state';
import { LeadDetail } from '@/features/leads/lead-detail';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Lead' };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSession();

  return (
    <Suspense
      fallback={
        <div className="p-4">
          <FieldsSkeleton fields={8} />
        </div>
      }
    >
      <LeadDetail id={id} role={user.role} />
    </Suspense>
  );
}
