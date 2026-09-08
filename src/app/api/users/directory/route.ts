import { requireStaff } from '@/lib/auth/rbac';
import { handleApi } from '@/server/api-handler';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista enxuta para transferência de conversa. Sem e-mail nem papel administrativo. */
export async function GET() {
  return handleApi(async () => {
    await requireStaff();
    const rows = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return rows;
  });
}
