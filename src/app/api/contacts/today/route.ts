import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { getContactsToday } from '@/server/services/contacts.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contactsQuerySchema = z.object({
  bucket: z.enum(['overdue', 'today', 'new', 'future', 'all']).default('all'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(10).max(100).default(50),
});

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const query = contactsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return getContactsToday(user, query);
  });
}
