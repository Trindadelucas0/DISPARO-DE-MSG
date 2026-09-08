import { redirect } from 'next/navigation';

import { LoginForm } from '@/features/auth/login-form';
import { homePathForRole } from '@/lib/auth/access';
import { getSessionUser } from '@/lib/auth/rbac';

export const metadata = { title: 'Entrar — CRM Prospecção' };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homePathForRole(user.role));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      {/* max-w é permitido aqui: formulário de autenticação não é tela operacional. */}
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">CRM Prospecção</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Entre com a conta cadastrada.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
