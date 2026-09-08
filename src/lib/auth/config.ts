import type { NextAuthConfig } from 'next-auth';

/**
 * Configuração compartilhada entre o middleware (runtime edge) e o servidor.
 *
 * Aqui NÃO pode entrar Prisma nem bcryptjs: o middleware roda no edge e não
 * suporta binário nativo. O provider Credentials vive em src/lib/auth/index.ts.
 */

export const AUTH_PAGES = {
  signIn: '/login',
} as const;

/** Rotas acessíveis sem sessão. Tudo o mais exige autenticação. */
const PUBLIC_PREFIXES = ['/login', '/api/auth'] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Requisição de API não passa pelo middleware de Auth.js.
 *
 * Se o middleware intercepta `/api/*`, ele chama getSession e copia Set-Cookie
 * na resposta. Um GET /api/events sem cookie (SSE) faz o Auth.js mandar
 * cookie vazio e **apaga** a sessão do vendedor: GET /api/leads ainda 200,
 * POST /api/leads vira 401, a tela manda de volta ao login.
 * Autorização da API continua em requireSession() em cada handler.
 */
export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/** Espelha o matcher do middleware: API e estáticos ficam de fora. */
export function isExcludedFromAuthMiddleware(pathname: string): boolean {
  if (isApiPath(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico') return true;
  if (/\.(?:svg|png|jpg|jpeg|webp|ico)$/i.test(pathname)) return true;
  return false;
}

export const authConfig = {
  pages: AUTH_PAGES,
  session: {
    // Credentials exige JWT: não há adapter de sessão em banco neste fluxo.
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // turno de trabalho
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // `user` só vem preenchido no login; nas renovações o token já carrega tudo.
      if (user) {
        token.role = user.role;
        token.userId = user.id ?? token.sub;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      if (token.role) {
        session.user.role = token.role;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname) || isApiPath(pathname)) return true;
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
