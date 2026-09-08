import type { NextRequest } from 'next/server';

import { importErrorsQuerySchema } from '@/features/import/schema';
import { ForbiddenError, canImport, requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { listImportErrors } from '@/server/services/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Linhas rejeitadas (severity ERROR) e campos descartados (WARNING) do job.
 * Sem filtro de severidade, vem tudo — o relatório completo do que não entrou.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const user = await requireSession();
    if (!canImport(user)) {
      throw new ForbiddenError('O relatório de erros é visível para gestor e administrador.');
    }

    const { id } = await params;
    const query = importErrorsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    return listImportErrors(id, query.page, query.limit, query.severity);
  });
}
