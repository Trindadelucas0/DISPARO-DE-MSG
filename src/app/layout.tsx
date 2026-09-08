import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { Providers } from '@/components/providers';

import './globals.css';

/**
 * Geist Sans na interface, Geist Mono em dado técnico.
 * Inter é proibida pela regra ux-ui-crm §1.
 */
export const metadata: Metadata = {
  title: 'CRM Prospecção',
  description: 'Prospecção, leads, funil e follow-up.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
