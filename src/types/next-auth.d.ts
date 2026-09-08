import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    id?: string;
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession['user'];
  }
}

/**
 * O tipo `JWT` do Auth.js v5 mora em `@auth/core/jwt`; `next-auth/jwt` apenas
 * reexporta. Sem augmentar o módulo de origem, `token.userId` cai no index
 * signature (`unknown`) e o TypeScript não reconhece os campos.
 */
declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string;
    role?: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    role?: Role;
  }
}
