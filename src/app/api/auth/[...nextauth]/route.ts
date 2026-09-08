import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;

// bcryptjs e Prisma precisam do runtime Node.
export const runtime = 'nodejs';
