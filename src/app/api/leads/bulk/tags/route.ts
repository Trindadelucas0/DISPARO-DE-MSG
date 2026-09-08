import type { NextRequest } from 'next/server';

import { bulkTagSchema } from '@/features/reports/schema';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { bulkTagLeads } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const input = bulkTagSchema.parse(await request.json());
    return bulkTagLeads(user, input, {
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
