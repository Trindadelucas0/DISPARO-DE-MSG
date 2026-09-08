'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';

import { signIn } from '@/lib/auth';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithCredentials(input: unknown): Promise<SignInResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Informe um e-mail válido e a senha.' };
  }

  try {
    await signIn('credentials', { ...parsed.data, redirect: false });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      // CredentialsSignin cobre usuário inexistente, inativo e senha errada.
      // A mensagem é a mesma nos três casos, de propósito.
      if (error.type === 'CredentialsSignin') {
        return { ok: false, error: 'E-mail ou senha incorretos.' };
      }
      // O provider lança erro próprio quando o rate limit estoura; a causa
      // preserva a mensagem com o tempo de espera.
      const cause = error.cause?.err?.message;
      if (cause) return { ok: false, error: cause };
      return { ok: false, error: 'Não foi possível entrar. Tente novamente.' };
    }
    throw error;
  }
}
