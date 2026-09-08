import { compare } from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { authConfig } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Rate limit por e-mail: impede varredura de senha sem depender do IP,
        // que atrás de NAT é compartilhado por todo o escritório.
        const limit = await checkRateLimit('login', email, RATE_LIMITS.login);
        if (!limit.allowed) {
          throw new Error(
            `Muitas tentativas de login. Tente novamente em ${limit.retryAfterSeconds} segundos.`,
          );
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            active: true,
          },
        });

        // Mesma resposta para usuário inexistente, inativo e senha errada:
        // não confirma a existência da conta para quem está tentando adivinhar.
        if (!user || !user.active) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
