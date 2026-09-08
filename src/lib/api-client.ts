import type { ApiErrorBody } from '@/server/api-handler';

/**
 * Cliente HTTP das telas.
 *
 * A API já devolve mensagem legível em português (ver `handleApi`). Este
 * wrapper preserva essa mensagem para o estado de erro poder mostrar a causa,
 * em vez de "algo deu errado" (regra ux-ui-crm §5).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorBody['kind'];
  readonly fields?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = 'ApiError';
    this.status = status;
    this.kind = body.kind;
    this.fields = body.fields;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (typeof body?.error === 'string') {
      return new ApiError(response.status, body);
    }
  } catch {
    // Resposta sem JSON (proxy, timeout, HTML de erro): cai no genérico abaixo.
  }
  return new ApiError(response.status, {
    error: `O servidor respondeu ${response.status} sem detalhe.`,
    kind: 'internal',
  });
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

async function send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

export const apiPost = <T>(path: string, body?: unknown) => send<T>('POST', path, body);
export const apiPatch = <T>(path: string, body?: unknown) => send<T>('PATCH', path, body);
export const apiDelete = <T>(path: string, body?: unknown) => send<T>('DELETE', path, body);

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    body,
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

/** Mensagem pronta para a UI, sem vazar objeto de erro cru. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Erro inesperado.';
}
