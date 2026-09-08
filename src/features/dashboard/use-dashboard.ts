'use client';

import { useQuery } from '@tanstack/react-query';

import type { DashboardFilters } from '@/features/dashboard/schema';
import { apiGet } from '@/lib/api-client';
import type { DashboardPayload } from '@/server/services/metrics.service';

export function dashboardApiUrl(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  return `/api/dashboard?${params.toString()}`;
}

export function useDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: ({ signal }) => apiGet<DashboardPayload>(dashboardApiUrl(filters), signal),
    staleTime: 60_000,
  });
}
