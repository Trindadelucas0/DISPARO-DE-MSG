import { redirect } from 'next/navigation';

import { homePathForRole } from '@/lib/auth/access';
import { getSessionUser } from '@/lib/auth/rbac';

/** Admin/gestor abre em Leads. Vendedor abre no Kanban. */
export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(homePathForRole(user.role));
}
