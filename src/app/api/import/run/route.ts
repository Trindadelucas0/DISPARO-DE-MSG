import type { NextRequest } from 'next/server';

import { runRequestSchema, toColumnMapping } from '@/features/import/schema';
import { ForbiddenError, canImport, requireSession } from '@/lib/auth/rbac';
import { RATE_LIMITS, checkRateLimit, clientIp } from '@/lib/rate-limit';
import { RateLimitError, handleApi } from '@/server/api-handler';
import type { ColumnMapping } from '@/server/services/import.service';
import {
  createImportJob,
  failImportJob,
  readWorkbookFromBuffer,
  runImport,
} from '@/server/services/import.service';
import { deleteUpload, readUpload } from '@/server/services/import/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dispara a importação e responde na hora com o id do job.
 *
 * A carga roda depois da resposta, no mesmo processo do Next, e o progresso vai
 * para `ImportJob` — a tela acompanha por `GET /api/import/jobs/:id`. Como o
 * job guarda `offset`, uma queda do servidor no meio não duplica lead nem
 * obriga a reimportar tudo.
 */
export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    if (!canImport(user)) {
      throw new ForbiddenError('Importar planilha é ação de gestor ou administrador.');
    }

    const limit = await checkRateLimit(
      'import',
      `${user.id}:${clientIp(request.headers)}`,
      RATE_LIMITS.import,
    );
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const input = runRequestSchema.parse(await request.json());
    // Lido antes de responder: arquivo ausente tem de virar erro visível agora,
    // não um job que falha em segundo plano.
    const buffer = await readUpload(input.uploadId);

    const job = await createImportJob({
      fileName: input.fileName,
      source: 'upload',
      onlyActive: input.onlyActive,
      userId: user.id,
    });

    const sheet = await readWorkbookFromBuffer(buffer);

    void runImport(sheet, {
      jobId: job.id,
      userId: user.id,
      onlyActive: input.onlyActive,
      mappingOverride: toColumnMapping(input.mapping) as ColumnMapping | undefined,
      origem: input.fileName,
    })
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        await failImportJob(job.id, message);
      })
      .finally(() => deleteUpload(input.uploadId));

    return { jobId: job.id };
  });
}
