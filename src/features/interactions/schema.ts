import { FollowUpStatus, InteractionResult, InteractionType, LeadStatus } from '@prisma/client';
import { z } from 'zod';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

export const createInteractionSchema = z
  .object({
    type: z.nativeEnum(InteractionType),
    result: z.nativeEnum(InteractionResult).nullable().optional(),
    content: z.string().trim().max(8000).nullable().optional(),
    templateId: z.string().trim().min(1).nullable().optional(),
    scheduledFor: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.')
      .nullable()
      .optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    status: z.nativeEnum(LeadStatus).optional(),
  })
  .strict();

export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;

export const createFollowUpSchema = z
  .object({
    leadId: z.string().trim().min(1),
    scheduledFor: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.'),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const patchFollowUpSchema = z
  .object({
    status: z.nativeEnum(FollowUpStatus).optional(),
    scheduledFor: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.')
      .optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined || value.scheduledFor !== undefined || value.note !== undefined,
    'Informe o que alterar.',
  );

export const followUpListSchema = z.object({
  tab: z.enum(['overdue', 'today', 'upcoming', 'all']).default('overdue'),
  status: z.union([z.nativeEnum(FollowUpStatus), z.literal('OPEN')]).optional(),
  responsible: emptyToUndefined(z.string().trim().max(40)),
  leadStatus: emptyToUndefined(z.nativeEnum(LeadStatus)),
  state: emptyToUndefined(z.string().trim().length(2).toUpperCase()),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(10).max(200).default(50),
});

export type FollowUpListFilters = z.infer<typeof followUpListSchema>;
