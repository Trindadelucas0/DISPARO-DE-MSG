import type { LeadFilters } from '@/features/leads/schema';
import { CACHE_TAGS, CACHE_TTL, cacheKey, filterHash, getOrSet } from '@/lib/cache';
import { assertStaff, leadScopeWhere, type SessionUser } from '@/lib/auth/rbac';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { loadDashboardMetrics } from '@/server/repositories/metrics.repository';

export interface DashboardKpi {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly hint: string;
}

export interface NamedCount {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

export interface UpcomingAction {
  readonly id: string;
  readonly leadId: string;
  readonly razaoSocial: string;
  readonly cidade: string | null;
  readonly estado: string | null;
  readonly responsavelNome: string;
  readonly scheduledFor: string;
  readonly note: string | null;
}

export interface DashboardPayload {
  readonly kpis: readonly DashboardKpi[];
  readonly byStatus: readonly NamedCount[];
  readonly activityToday: {
    readonly contacts: number;
    readonly responses: number;
  };
  readonly upcoming: readonly UpcomingAction[];
}

export async function getDashboard(
  user: SessionUser,
  filters: LeadFilters,
): Promise<DashboardPayload> {
  assertStaff(user);
  const scope = leadScopeWhere(user);
  const key = cacheKey('dashboard', `${user.role}:${user.id}:${filterHash(filters)}`);

  return getOrSet(
    key,
    CACHE_TTL.dashboard,
    async () => {
      const raw = await loadDashboardMetrics(filters, scope);

      const statusMap = new Map(raw.byStatus.map((row) => [row.status, row._count._all]));
      const byStatus = LEAD_STATUS_ORDER.map((status) => ({
        key: status,
        label: leadStatusLabel(status),
        count: statusMap.get(status) ?? 0,
      }));

      const kpis: DashboardKpi[] = [
        {
          key: 'total',
          label: 'Leads',
          value: raw.total,
          hint: 'Quantidade após os filtros da tela, no seu escopo.',
        },
        {
          key: 'whatsapp',
          label: 'Com WhatsApp',
          value: raw.withWhatsapp,
          hint: 'Celular válido na base.',
        },
        {
          key: 'contactToday',
          label: 'Para contato',
          value: raw.contactToday,
          hint: 'Leads com próxima ação agendada para hoje.',
        },
        {
          key: 'contacted',
          label: 'Contatados',
          value: raw.contacted,
          hint: 'Status Contatado no funil.',
        },
        {
          key: 'responded',
          label: 'Responderam',
          value: raw.responded,
          hint: 'Última interação com resultado Respondeu.',
        },
        {
          key: 'qualified',
          label: 'Qualificados',
          value: raw.qualified,
          hint: 'Status Qualificado no funil.',
        },
        {
          key: 'customers',
          label: 'Clientes',
          value: raw.customers,
          hint: 'Status Cliente no funil.',
        },
        {
          key: 'overdue',
          label: 'Follow-ups atrasados',
          value: raw.overdueFollowUps,
          hint: 'Pendentes com data anterior a hoje.',
        },
      ];

      return {
        kpis,
        byStatus,
        activityToday: {
          contacts: raw.interactionsToday,
          responses: raw.responsesToday,
        },
        upcoming: raw.upcomingFollowUps.map((row) => ({
          id: row.id,
          leadId: row.leadId,
          razaoSocial: row.lead.razaoSocial,
          cidade: row.lead.cidade,
          estado: row.lead.estado,
          responsavelNome: row.responsavel.name,
          scheduledFor: row.scheduledFor.toISOString(),
          note: row.note,
        })),
      };
    },
    { tags: [CACHE_TAGS.dashboard, CACHE_TAGS.leads] },
  );
}
