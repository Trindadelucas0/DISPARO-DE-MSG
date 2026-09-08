import type { InteractionType, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

export const TEMPLATE_SELECT = {
  id: true,
  name: true,
  channel: true,
  subject: true,
  body: true,
  variables: true,
  active: true,
  mediaId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  media: {
    select: { id: true, kind: true, mimeType: true, fileName: true, sizeBytes: true },
  },
} satisfies Prisma.MessageTemplateSelect;

export type TemplateRow = Prisma.MessageTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;

export async function listTemplates(activeOnly: boolean): Promise<TemplateRow[]> {
  return prisma.messageTemplate.findMany({
    where: activeOnly ? { active: true } : undefined,
    select: TEMPLATE_SELECT,
    orderBy: { name: 'asc' },
  });
}

export async function findTemplate(id: string): Promise<TemplateRow | null> {
  return prisma.messageTemplate.findUnique({ where: { id }, select: TEMPLATE_SELECT });
}

export async function createTemplate(data: {
  name: string;
  channel: InteractionType;
  subject?: string | null;
  body: string;
  variables: string[];
  createdById: string;
  mediaId?: string | null;
}): Promise<TemplateRow> {
  return prisma.messageTemplate.create({
    data: {
      name: data.name,
      channel: data.channel,
      subject: data.subject ?? null,
      body: data.body,
      variables: data.variables,
      createdById: data.createdById,
      mediaId: data.mediaId ?? null,
    },
    select: TEMPLATE_SELECT,
  });
}

export async function updateTemplate(
  id: string,
  data: Prisma.MessageTemplateUpdateInput,
): Promise<TemplateRow> {
  return prisma.messageTemplate.update({ where: { id }, data, select: TEMPLATE_SELECT });
}

export async function deleteTemplate(id: string): Promise<void> {
  await prisma.messageTemplate.delete({ where: { id } });
}
