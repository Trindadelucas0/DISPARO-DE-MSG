'use client';

import { ImportJobStatus } from '@prisma/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { invalidateClientTags } from '@/features/events/invalidate-client';
import type { ColumnMappingInput } from '@/features/import/schema';
import { ApiError, apiGet, apiPost } from '@/lib/api-client';
import type {
  getImportJob,
  listImportErrors,
  listImportJobs,
} from '@/server/services/import.service';
import type { ImportPreview } from '@/server/services/import.service';

export type ImportJob = NonNullable<Awaited<ReturnType<typeof getImportJob>>>;
export type ImportJobSummary = Awaited<ReturnType<typeof listImportJobs>>[number];
export type ImportErrorPage = Awaited<ReturnType<typeof listImportErrors>>;

export interface UploadResult {
  readonly uploadId: string;
  readonly fileName: string;
  readonly size: number;
}

export function useUploadSheet() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadResult> => {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/import/upload', { method: 'POST', body });
      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new ApiError(response.status, {
          error: parsed?.error ?? `Falha no envio (${response.status}).`,
          kind: 'validation',
        });
      }
      return (await response.json()) as UploadResult;
    },
  });
}

export function usePreview() {
  return useMutation({
    mutationFn: (input: {
      uploadId: string;
      onlyActive: boolean;
      mapping?: ColumnMappingInput;
    }) => apiPost<ImportPreview>('/api/import/preview', input),
  });
}

export function useRunImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      uploadId: string;
      fileName: string;
      onlyActive: boolean;
      mapping?: ColumnMappingInput;
    }) => apiPost<{ jobId: string }>('/api/import/run', input),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['import-jobs']);
    },
  });
}

/**
 * Acompanha o job enquanto ele roda.
 *
 * É o único lugar do sistema com consulta repetida, e ela existe porque há um
 * processo em andamento com fim previsto: `refetchInterval` volta a `false`
 * assim que o job termina, então não há polling ocioso.
 */
export function useImportJob(jobId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['import', 'job', jobId],
    queryFn: ({ signal }) => apiGet<ImportJob>(`/api/import/jobs/${jobId}`, signal),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === ImportJobStatus.PENDING || status === ImportJobStatus.RUNNING) return 1000;
      return false;
    },
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status === ImportJobStatus.COMPLETED) {
      invalidateClientTags(queryClient, [
        'leads',
        'dashboard',
        'contacts',
        'reports',
        'import-jobs',
      ]);
    }
  }, [status, queryClient]);
  return query;
}

export function useImportJobs() {
  return useQuery({
    queryKey: ['import', 'jobs'],
    queryFn: ({ signal }) => apiGet<{ jobs: ImportJobSummary[] }>('/api/import/jobs', signal),
    staleTime: 30_000,
  });
}

export function useImportErrors(jobId: string | null, page: number) {
  return useQuery({
    queryKey: ['import', 'errors', jobId, page],
    queryFn: ({ signal }) =>
      apiGet<ImportErrorPage>(`/api/import/jobs/${jobId}/errors?page=${page}&limit=50`, signal),
    enabled: jobId !== null,
  });
}
