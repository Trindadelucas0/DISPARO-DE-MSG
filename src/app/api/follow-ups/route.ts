import type { NextRequest } from 'next/server';

import { createFollowUpSchema, followUpListSchema } from '@/features/interactions/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { handleApi } from '@/server/api-handler';
import { listUserFollowUps, scheduleFollowUp } from '@/server/services/follow-up.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const filters = followUpListSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return listUserFollowUps(user, filters);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const input = createFollowUpSchema.parse(await request.json());
    return scheduleFollowUp(user, input, {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
