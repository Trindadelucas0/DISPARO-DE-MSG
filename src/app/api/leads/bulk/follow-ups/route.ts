import type { NextRequest } from 'next/server';

import { bulkFollowUpSchema } from '@/features/reports/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { bulkScheduleFollowUps } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const input = bulkFollowUpSchema.parse(await request.json());
    return bulkScheduleFollowUps(user, input, {
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
