import { InteractionType } from '@prisma/client';
import { z } from 'zod';

export const templateWriteSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    channel: z.nativeEnum(InteractionType).default('WHATSAPP'),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().max(8000).default(''),
    active: z.boolean().optional(),
    mediaId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.body.trim() && !value.mediaId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o texto ou anexe uma foto ou vídeo.',
        path: ['body'],
      });
    }
    if (value.body.trim() && value.body.trim().length < 4 && !value.mediaId) {
      ctx.addIssue({
        code: 'custom',
        message: 'O corpo precisa ter pelo menos 4 caracteres.',
        path: ['body'],
      });
    }
  });

export const templatePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    channel: z.nativeEnum(InteractionType).optional(),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().max(8000).optional(),
    active: z.boolean().optional(),
    mediaId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const whatsappSendSchema = z
  .object({
    templateId: z.string().trim().min(1).nullable().optional(),
    content: z.string().trim().max(8000).default(''),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.content.trim() && !value.templateId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o texto ou escolha um template.',
        path: ['content'],
      });
    }
  });
