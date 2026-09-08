import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BadRequestError } from '@/server/api-handler';

/**
 * Guarda temporária do arquivo enviado na tela /import.
 *
 * O fluxo é upload → mapeamento → prévia → confirmação, e cada passo precisa
 * reler a mesma planilha. Guardar em disco evita mandar o arquivo de novo a
 * cada ajuste de mapeamento e evita manter dezenas de megabytes na memória do
 * processo entre requisições.
 */

const UPLOAD_DIR = join(process.cwd(), 'uploads');

/** Só o formato gerado aqui é aceito: barra o path traversal no id. */
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Arquivo temporário mais velho que isto é lixo de sessão abandonada. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export class UploadNotFoundError extends BadRequestError {
  constructor() {
    super('O arquivo enviado expirou ou não está mais disponível. Envie a planilha novamente.');
    this.name = 'UploadNotFoundError';
  }
}

function pathFor(uploadId: string): string {
  if (!UPLOAD_ID.test(uploadId)) throw new UploadNotFoundError();
  return join(UPLOAD_DIR, `${uploadId}.xlsx`);
}

export async function saveUpload(buffer: Buffer): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const uploadId = randomUUID();
  await writeFile(join(UPLOAD_DIR, `${uploadId}.xlsx`), buffer);
  void cleanupExpired();
  return uploadId;
}

export async function readUpload(uploadId: string): Promise<Buffer> {
  try {
    return await readFile(pathFor(uploadId));
  } catch {
    throw new UploadNotFoundError();
  }
}

export async function deleteUpload(uploadId: string): Promise<void> {
  try {
    await unlink(pathFor(uploadId));
  } catch {
    // Já removido: o objetivo (arquivo fora do disco) está atingido.
  }
}

/** Melhor esforço: falha na limpeza não pode interromper uma importação. */
async function cleanupExpired(): Promise<void> {
  try {
    const entries = await readdir(UPLOAD_DIR);
    const now = Date.now();
    for (const entry of entries) {
      const fullPath = join(UPLOAD_DIR, entry);
      const info = await stat(fullPath);
      if (now - info.mtimeMs > MAX_AGE_MS) await unlink(fullPath);
    }
  } catch (error) {
    console.error('[import] limpeza de uploads falhou:', (error as Error).message);
  }
}
