import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';

/**
 * Fronteira de erro dos route handlers.
 *
 * Traduz erro de domínio em status HTTP com mensagem legível em português — a
 * interface mostra essa mensagem no estado de erro. Erro inesperado nunca vaza
 * stack nem detalhe de banco para o cliente.
 */

export interface ApiErrorBody {
  readonly error: string;
  readonly kind: 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limit' | 'internal';
  readonly fields?: Record<string, string[]>;
}

/**
 * Entrada inválida que o Zod não cobre — arquivo com extensão errada, upload
 * vazio, id expirado. É 422, não 403: o usuário tem permissão, o dado é que
 * não serve.
 */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Registro não encontrado.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message?: string) {
    super(message ?? `Muitas requisições. Tente novamente em ${retryAfterSeconds} segundos.`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function handleApi<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    if (data instanceof NextResponse) return data;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] = [...(fields[key] ?? []), issue.message];
      }
      return NextResponse.json<ApiErrorBody>(
        { error: 'Dados inválidos na requisição.', kind: 'validation', fields },
        { status: 422 },
      );
    }

    if (error instanceof BadRequestError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message, kind: 'validation' },
        { status: 422 },
      );
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message, kind: 'unauthorized' },
        { status: 401 },
      );
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message, kind: 'forbidden' },
        { status: 403 },
      );
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message, kind: 'not_found' },
        { status: 404 },
      );
    }

    if (error instanceof RateLimitError) {
      return NextResponse.json<ApiErrorBody>(
        { error: error.message, kind: 'rate_limit' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }

    console.error('[api] erro não tratado:', error);
    return NextResponse.json<ApiErrorBody>(
      {
        error: 'Erro interno ao processar a requisição. O log do servidor tem o detalhe.',
        kind: 'internal',
      },
      { status: 500 },
    );
  }
}
