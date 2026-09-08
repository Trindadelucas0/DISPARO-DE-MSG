import type { NextRequest } from 'next/server';

import { templatePatchSchema } from '@/features/messages/schema';
import { requireStaff } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import {
  getTemplate,
  patchMessageTemplate,
  removeMessageTemplate,
} from '@/server/services/template.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    await requireStaff();
    const { id } = await context.params;
    return getTemplate(id);
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireStaff();
    const { id } = await context.params;
    const input = templatePatchSchema.parse(await request.json());
    return patchMessageTemplate(user, id, input);
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireStaff();
    const { id } = await context.params;
    return removeMessageTemplate(user, id);
  });
}
