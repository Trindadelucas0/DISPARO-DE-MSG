import { Role } from '@prisma/client';
import { z } from 'zod';

import { BULK_LIMIT } from '@/features/leads/bulk-schema';

export const bulkTagSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1).max(BULK_LIMIT),
    tagId: z.string().trim().min(1),
    action: z.enum(['add', 'remove']),
  })
  .strict();

export const bulkFollowUpSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1).max(BULK_LIMIT),
    scheduledFor: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida.'),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(10).max(200),
    role: z.nativeEnum(Role),
  })
  .strict();

export const patchUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.nativeEnum(Role).optional(),
    active: z.boolean().optional(),
    password: z.string().min(10).max(200).optional(),
  })
  .strict();

export const reportsRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
