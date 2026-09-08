import type { NextRequest } from 'next/server';

import { ForbiddenError, canImport, requireSession } from '@/lib/auth/rbac';
import { RATE_LIMITS, checkRateLimit, clientIp } from '@/lib/rate-limit';
import { BadRequestError, RateLimitError, handleApi } from '@/server/api-handler';
import { MAX_UPLOAD_BYTES, saveUpload } from '@/server/services/import/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm'];

/**
 * Recebe a planilha e devolve só o identificador do arquivo guardado.
 *
 * A leitura acontece no passo seguinte (`/api/import/preview`): assim o usuário
 * pode ajustar o mapeamento de colunas quantas vezes quiser sem reenviar o
 * arquivo.
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

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      throw new BadRequestError('Nenhum arquivo recebido no campo "file".');
    }

    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      throw new BadRequestError(
        `Formato não aceito. Envie um arquivo ${ACCEPTED_EXTENSIONS.join(' ou ')}.`,
      );
    }

    if (file.size === 0) {
      throw new BadRequestError('O arquivo enviado está vazio.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestError(
        `Arquivo acima do limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      );
    }

    const uploadId = await saveUpload(Buffer.from(await file.arrayBuffer()));

    return { uploadId, fileName: file.name, size: file.size };
  });
}
