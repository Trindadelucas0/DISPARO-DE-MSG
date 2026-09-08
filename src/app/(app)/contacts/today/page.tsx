import type { Metadata } from 'next';

import { ContactsTodayScreen } from '@/features/contacts/contacts-today-screen';
import { requireSession } from '@/lib/auth/rbac';

export const metadata: Metadata = { title: 'Contatos do dia' };

export default async function ContactsTodayPage() {
  await requireSession();
  return <ContactsTodayScreen />;
}
