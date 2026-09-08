import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';

import { homePathForRole, isSellerAllowedPage, isSellerRole } from '@/lib/auth/access';
import { authConfig } from '@/lib/auth/config';

/**
 * O middleware redireciona página sem sessão e impede o vendedor de abrir
 * telas fora de Kanban e Inbox. Ele NÃO autoriza API: `/api/*` fica fora do
 * matcher. Cada route handler revalida sessão e papel via requireSession.
 */
const { auth } = NextAuth(authConfig);

export const middleware = auth((req) => {
  const role = req.auth?.user?.role;
  const pathname = req.nextUrl.pathname;
  if (isSellerRole(role) && !isSellerAllowedPage(pathname)) {
    return NextResponse.redirect(new URL(homePathForRole(role), req.nextUrl));
  }
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
};
