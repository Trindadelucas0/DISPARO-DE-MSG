import type { NextRequest } from 'next/server';

import { leadUpdateSchema } from '@/features/leads/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { NotFoundError, handleApi } from '@/server/api-handler';
import { getLead, patchLead } from '@/server/services/lead.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const lead = await getLead(user, id);
    if (!lead) {
      throw new NotFoundError('Lead não encontrado ou fora do seu escopo de acesso.');
    }
    return lead;
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const body: unknown = await request.json();
    const input = leadUpdateSchema.parse(body);

    return patchLead(user, id, input, {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
