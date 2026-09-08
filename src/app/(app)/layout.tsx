import { redirect } from 'next/navigation';

import { signOutAction } from '@/app/(app)/actions';
import { AppShell } from '@/components/shell/app-shell';
import { getSessionUser } from '@/lib/auth/rbac';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      onSignOut={signOutAction}
    >
      {children}
    </AppShell>
  );
}
