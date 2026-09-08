import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import {
  addWhatsAppAccount,
  createWhatsAppAccountSchema,
  getWhatsAppAccounts,
} from '@/server/services/whatsapp.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleApi(async () => {
    const user = await requireSession();
    return getWhatsAppAccounts(user);
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const body = createWhatsAppAccountSchema.parse(await request.json());
    return addWhatsAppAccount(user, body);
  });
}
