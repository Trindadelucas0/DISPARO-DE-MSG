import type { NextRequest } from 'next/server';

import { previewRequestSchema, toColumnMapping } from '@/features/import/schema';
import { ForbiddenError, canImport, requireSession } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { buildPreview, readWorkbookFromBuffer } from '@/server/services/import.service';
import type { ColumnMapping } from '@/server/services/import.service';
import { readUpload } from '@/server/services/import/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Prévia sem escrever nada no banco: contadores, duplicados e 20 linhas. */
export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    if (!canImport(user)) {
      throw new ForbiddenError('Importar planilha é ação de gestor ou administrador.');
    }

    const input = previewRequestSchema.parse(await request.json());
    const buffer = await readUpload(input.uploadId);
    const sheet = await readWorkbookFromBuffer(buffer);

    return buildPreview(sheet, {
      onlyActive: input.onlyActive,
      mappingOverride: toColumnMapping(input.mapping) as ColumnMapping | undefined,
      origem: 'upload',
    });
  });
}
