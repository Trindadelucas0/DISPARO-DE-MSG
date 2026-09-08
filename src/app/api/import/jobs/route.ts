import { ForbiddenError, canImport, requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { listImportJobs } from '@/server/services/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleApi(async () => {
    const user = await requireSession();
    if (!canImport(user)) {
      throw new ForbiddenError('O histórico de importações é visível para gestor e administrador.');
    }
    return { jobs: await listImportJobs() };
  });
}
