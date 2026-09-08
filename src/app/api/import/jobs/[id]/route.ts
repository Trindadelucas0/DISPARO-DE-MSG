import { ForbiddenError, canImport, requireSession } from '@/lib/auth/rbac';
import { NotFoundError, handleApi } from '@/server/api-handler';
import { getImportJob } from '@/server/services/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Progresso do job. A tela consulta enquanto o status for PENDING ou RUNNING. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireSession();
    if (!canImport(user)) {
      throw new ForbiddenError('O acompanhamento de importação é ação de gestor ou administrador.');
    }

    const { id } = await params;
    const job = await getImportJob(id);
    if (!job) throw new NotFoundError('Importação não encontrada.');
    return job;
  });
}
