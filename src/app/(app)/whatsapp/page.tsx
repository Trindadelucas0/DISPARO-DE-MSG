import type { Metadata } from 'next';

import { WhatsAppScreen } from '@/features/whatsapp/whatsapp-screen';
import { canImport, canManageWhatsAppAccounts, requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'WhatsApp' };

export default async function WhatsAppPage() {
  const user = await requireSession();
  return (
    <WhatsAppScreen
      canAdd={canManageWhatsAppAccounts(user)}
      canImportContacts={canImport(user)}
    />
  );
}
