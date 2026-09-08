import type { NextRequest } from 'next/server';

import { kanbanColumnSchema } from '@/features/dashboard/schema';
import { parseFiltersFromParams } from '@/features/leads/query';
import { requireSession } from '@/lib/auth/rbac';
import { handleApi, BadRequestError } from '@/server/api-handler';
import { getKanbanColumn } from '@/server/services/kanban.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const column = kanbanColumnSchema.parse(params);
    const filters = parseFiltersFromParams(params);
    const columnStatus = column.column ?? column.status;
    if (!columnStatus) {
      throw new BadRequestError('Informe a coluna do Kanban.');
    }
    return getKanbanColumn(user, columnStatus, column.offset, filters);
  });
}
