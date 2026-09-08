import { LeadStatus } from '@prisma/client';
import { z } from 'zod';

import { leadFiltersSchema } from '@/features/leads/schema';

export const dashboardFiltersSchema = leadFiltersSchema.omit({
  page: true,
  limit: true,
  sort: true,
  dir: true,
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export const kanbanColumnSchema = z
  .object({
    /** Coluna do funil. Preferir a este campo para não colidir com o filtro `status` da listagem. */
    column: z.nativeEnum(LeadStatus).optional(),
    status: z.nativeEnum(LeadStatus).optional(),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (!data.column && !data.status) {
      ctx.addIssue({ code: 'custom', message: 'Informe a coluna do Kanban.', path: ['column'] });
    }
  });

export const leadStatusPatchSchema = z
  .object({
    status: z.nativeEnum(LeadStatus),
  })
  .strict();
