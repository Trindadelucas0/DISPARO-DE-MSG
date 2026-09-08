import type { MediaKind } from '@prisma/client';
import { NextResponse } from 'next/server';

import { canAccessMediaAsset } from '@/lib/media/access';
import { inspectMedia, MediaStorageError, readMediaFile, writeMediaFile } from '@/lib/media/storage';
import { conversationScopeWhere, ForbiddenError, type SessionUser } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/server/api-handler';

export type SerializedMedia = {
  readonly id: string;
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly fileName: string;
  readonly sizeBytes: number;
};

function serializeMedia(row: {
  id: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}): SerializedMedia {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mimeType,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
  };
}

export async function persistMediaBuffer(input: {
  buffer: Buffer;
  fileName?: string | null;
  declaredMime?: string | null;
  createdById?: string | null;
  allowKinds?: readonly MediaKind[];
}): Promise<SerializedMedia> {
  try {
    const inspected = inspectMedia(input.buffer, {
      declaredMime: input.declaredMime,
      fileName: input.fileName,
    });
    if (input.allowKinds && !input.allowKinds.includes(inspected.kind)) {
      throw new BadRequestError(
        inspected.kind === 'AUDIO'
          ? 'Template aceita foto ou vídeo. Áudio só na Inbox.'
          : 'Este tipo de arquivo não é aceito aqui.',
      );
    }
    const storageKey = await writeMediaFile(input.buffer, inspected);
    const row = await prisma.mediaAsset.create({
      data: {
        kind: inspected.kind,
        mimeType: inspected.mimeType,
        fileName: inspected.fileName,
        sizeBytes: inspected.sizeBytes,
        storageKey,
        createdById: input.createdById ?? null,
      },
    });
    return serializeMedia(row);
  } catch (error) {
    if (error instanceof MediaStorageError) throw new BadRequestError(error.message);
    throw error;
  }
}

export async function uploadMedia(user: SessionUser, file: File): Promise<SerializedMedia> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return persistMediaBuffer({
    buffer,
    fileName: file.name,
    declaredMime: file.type,
    createdById: user.id,
  });
}

export async function getMediaAssetOrThrow(id: string) {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Mídia não encontrada.');
  return row;
}

export async function assertMediaReadable(user: SessionUser, mediaId: string) {
  const row = await getMediaAssetOrThrow(mediaId);
  const [template, message] = await Promise.all([
    prisma.messageTemplate.findFirst({ where: { mediaId }, select: { id: true } }),
    prisma.message.findFirst({
      where: { mediaId },
      select: { conversationId: true },
    }),
  ]);

  let conversationInScope = false;
  if (message) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: message.conversationId, ...conversationScopeWhere(user) },
      select: { id: true },
    });
    conversationInScope = Boolean(conversation);
  }

  if (
    !canAccessMediaAsset({
      userId: user.id,
      role: user.role,
      createdById: row.createdById,
      attachedToTemplate: Boolean(template),
      conversationInScope,
    })
  ) {
    throw new NotFoundError('Mídia não encontrada.');
  }
  return row;
}

export async function streamMedia(user: SessionUser, mediaId: string): Promise<NextResponse> {
  const row = await assertMediaReadable(user, mediaId);
  try {
    const buffer = await readMediaFile(row.storageKey);
    const safeName = row.fileName.replace(/[\r\n"]/g, '_');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': row.mimeType,
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof MediaStorageError) throw new NotFoundError('Mídia não encontrada.');
    throw error;
  }
}

export async function resolveOwnedOrAttachedMedia(
  user: SessionUser,
  mediaId: string,
  options: { allowKinds?: readonly MediaKind[] } = {},
) {
  const row = await getMediaAssetOrThrow(mediaId);
  if (options.allowKinds && !options.allowKinds.includes(row.kind)) {
    throw new BadRequestError(
      row.kind === 'AUDIO'
        ? 'Template aceita foto ou vídeo. Áudio só na Inbox.'
        : 'Este tipo de arquivo não é aceito aqui.',
    );
  }
  const attachedToTemplate = Boolean(
    await prisma.messageTemplate.findFirst({ where: { mediaId }, select: { id: true } }),
  );
  if (row.createdById !== user.id && !attachedToTemplate) {
    throw new ForbiddenError('Você não pode usar este arquivo.');
  }
  return row;
}

export { serializeMedia };
