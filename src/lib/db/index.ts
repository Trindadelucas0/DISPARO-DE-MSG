import { PrismaClient } from '@prisma/client';

/**
 * Instância única do Prisma. Em dev o hot reload recria o módulo, então a
 * instância vive no global para não abrir um pool novo a cada recompilação.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
