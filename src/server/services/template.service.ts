import { Prisma } from '@prisma/client';
import type { InteractionType } from '@prisma/client';

import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { extractTemplateVariables } from '@/lib/template';
import { ForbiddenError, canManageUsers, type SessionUser } from '@/lib/auth/rbac';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import {
  createTemplate,
  deleteTemplate,
  findTemplate,
  listTemplates,
  updateTemplate,
} from '@/server/repositories/template.repository';
import { recordAudit } from '@/server/services/audit.service';
import { resolveOwnedOrAttachedMedia, type SerializedMedia } from '@/server/services/media.service';

function serializeMedia(
  media: {
    id: string;
    kind: SerializedMedia['kind'];
    mimeType: string;
    fileName: string;
    sizeBytes: number;
  } | null,
): SerializedMedia | null {
  if (!media) return null;
  return {
    id: media.id,
    kind: media.kind,
    mimeType: media.mimeType,
    fileName: media.fileName,
    sizeBytes: media.sizeBytes,
  };
}

function serialize(row: Awaited<ReturnType<typeof listTemplates>>[number]) {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    variables: row.variables,
    active: row.active,
    media: serializeMedia(row.media),
    createdByNome: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type SerializedTemplate = ReturnType<typeof serialize>;

async function attachTemplateMedia(user: SessionUser, mediaId: string | null | undefined) {
  if (mediaId === undefined) return undefined;
  if (mediaId === null) return null;
  const asset = await resolveOwnedOrAttachedMedia(user, mediaId, {
    allowKinds: ['IMAGE', 'VIDEO'],
  });
  return asset.id;
}

export async function getTemplates(activeOnly: boolean) {
  const rows = await listTemplates(activeOnly);
  return rows.map(serialize);
}

export async function getTemplate(id: string) {
  const row = await findTemplate(id);
  if (!row) throw new NotFoundError('Template não encontrado.');
  return serialize(row);
}

function assertCanWriteTemplates(user: SessionUser) {
  if (!canManageUsers(user) && user.role !== 'MANAGER') {
    throw new ForbiddenError('Somente gestor ou administrador edita templates.');
  }
}

export async function createMessageTemplate(
  user: SessionUser,
  input: {
    name: string;
    channel: InteractionType;
    subject?: string | null;
    body: string;
    mediaId?: string | null;
  },
) {
  assertCanWriteTemplates(user);
  const mediaId = await attachTemplateMedia(user, input.mediaId);
  try {
    const row = await createTemplate({
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      variables: extractTemplateVariables(input.body),
      createdById: user.id,
      mediaId: mediaId ?? null,
    });
    await recordAudit({
      userId: user.id,
      action: 'template.create',
      entity: 'MessageTemplate',
      entityId: row.id,
      changes: { name: input.name },
    });
    await notifyChange({ type: 'template.create', tags: MUTATION_TAGS.template, entityId: row.id });
    return serialize(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestError('Já existe um template com este nome.');
    }
    throw error;
  }
}

export async function patchMessageTemplate(
  user: SessionUser,
  id: string,
  input: {
    name?: string;
    channel?: InteractionType;
    subject?: string | null;
    body?: string;
    active?: boolean;
    mediaId?: string | null;
  },
) {
  assertCanWriteTemplates(user);
  const current = await findTemplate(id);
  if (!current) throw new NotFoundError('Template não encontrado.');

  const nextBody = input.body !== undefined ? input.body : current.body;
  const nextMediaId =
    input.mediaId !== undefined ? await attachTemplateMedia(user, input.mediaId) : current.mediaId;
  if (!nextBody.trim() && !nextMediaId) {
    throw new BadRequestError('Informe o texto ou anexe uma foto ou vídeo.');
  }

  const row = await updateTemplate(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.channel !== undefined ? { channel: input.channel } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.body !== undefined
      ? { body: input.body, variables: extractTemplateVariables(input.body) }
      : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.mediaId !== undefined
      ? nextMediaId
        ? { media: { connect: { id: nextMediaId } } }
        : { media: { disconnect: true } }
      : {}),
  });

  await recordAudit({
    userId: user.id,
    action: 'template.update',
    entity: 'MessageTemplate',
    entityId: id,
    changes: { ...input },
  });
  await notifyChange({ type: 'template.update', tags: MUTATION_TAGS.template, entityId: id });
  return serialize(row);
}

export async function removeMessageTemplate(user: SessionUser, id: string) {
  assertCanWriteTemplates(user);
  const current = await findTemplate(id);
  if (!current) throw new NotFoundError('Template não encontrado.');
  await deleteTemplate(id);
  await recordAudit({
    userId: user.id,
    action: 'template.delete',
    entity: 'MessageTemplate',
    entityId: id,
  });
  await notifyChange({ type: 'template.delete', tags: MUTATION_TAGS.template, entityId: id });
  return { ok: true };
}
