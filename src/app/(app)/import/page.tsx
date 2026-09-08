import type { Metadata } from 'next';

import { ForbiddenState } from '@/components/ui/data-state';
import { ImportScreen } from '@/features/import/import-screen';
import { canImport, requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Importar' };

export default async function ImportPage() {
  const user = await requireSession();

  // A API também barra (todo endpoint de import checa `canImport`); aqui a
  // negativa é explicada em vez de a tela simplesmente não abrir.
  if (!canImport(user)) {
    return (
      <ForbiddenState reason="Importar planilha é ação de gestor ou administrador. Seu perfil é Vendedor." />
    );
  }

  return <ImportScreen />;
}
