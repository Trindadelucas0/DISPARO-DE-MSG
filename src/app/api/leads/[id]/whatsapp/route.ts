import type { NextRequest } from 'next/server';

import { whatsappSendSchema } from '@/features/messages/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { handleApi } from '@/server/api-handler';
import { sendLeadWhatsapp } from '@/server/services/conversation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Com conta CONNECTED (não-manual): envia pelo gateway, grava SENT e devolve conversationId.
 * Sem sessão: registra OPENED e devolve a URL do wa.me.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    const { id } = await context.params;
    const input = whatsappSendSchema.parse(await request.json());
    return sendLeadWhatsapp(user, id, input, {
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });
  });
}
