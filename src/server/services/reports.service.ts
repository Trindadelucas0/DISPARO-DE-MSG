import type { LeadFilters } from '@/features/leads/schema';
import { CACHE_TAGS, CACHE_TTL, cacheKey, filterHash, getOrSet } from '@/lib/cache';
import { daysAgo, endOfDay, startOfDay } from '@/lib/dates';
import { assertStaff, leadScopeWhere, type SessionUser } from '@/lib/auth/rbac';
import {
  INTERACTION_RESULT_META,
  INTERACTION_TYPE_META,
} from '@/constants/interactions';
import {
  findUsersByIds,
  loadReportMetrics,
} from '@/server/repositories/metrics.repository';

export interface ReportsPayload {
  readonly from: string;
  readonly to: string;
  readonly totalInteractions: number;
  readonly sent: number;
  readonly responded: number;
  readonly responseRate: number | null;
  readonly byUser: readonly { id: string; name: string; count: number }[];
  readonly byType: readonly { key: string; label: string; count: number }[];
  readonly byResult: readonly { key: string; label: string; count: number }[];
}

export async function getReports(
  user: SessionUser,
  filters: LeadFilters,
  range: { from?: string; to?: string },
): Promise<ReportsPayload> {
  assertStaff(user);
  const from = range.from ? startOfDay(new Date(range.from)) : daysAgo(30);
  const to = range.to ? endOfDay(new Date(range.to)) : endOfDay();
  const key = cacheKey(
    'reports',
    `${user.role}:${user.id}:${filterHash({ filters, from: from.toISOString(), to: to.toISOString() })}`,
  );

  return getOrSet(
    key,
    CACHE_TTL.dashboard,
    async () => {
      const raw = await loadReportMetrics(filters, leadScopeWhere(user), from, to);
      const users = await findUsersByIds(raw.byUser.map((row) => row.userId));
      const names = new Map(users.map((entry) => [entry.id, entry.name]));

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        totalInteractions: raw.totalInteractions,
        sent: raw.sent,
        responded: raw.responded,
        responseRate: raw.sent > 0 ? Math.round((raw.responded / raw.sent) * 1000) / 10 : null,
        byUser: raw.byUser
          .map((row) => ({
            id: row.userId,
            name: names.get(row.userId) ?? 'Usuário removido',
            count: row._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        byType: raw.byType.map((row) => ({
          key: row.type,
          label: INTERACTION_TYPE_META[row.type].label,
          count: row._count._all,
        })),
        byResult: raw.byResult
          .filter((row) => row.result)
          .map((row) => ({
            key: row.result as string,
            label: INTERACTION_RESULT_META[row.result!].label,
            count: row._count._all,
          })),
      };
    },
    { tags: [CACHE_TAGS.reports, CACHE_TAGS.dashboard] },
  );
}
