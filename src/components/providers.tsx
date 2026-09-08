'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import * as React from 'react';
import { Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui/primitives';

/**
 * `staleTime` por domínio é definido em cada hook (src/hooks). Aqui ficam só os
 * padrões globais.
 *
 * `refetchOnWindowFocus` desligado: o vendedor troca de janela para o WhatsApp
 * o tempo todo, e refetch a cada volta gera tráfego sem informação nova.
 * Invalidação vem do SSE (`EventsBridge` no AppShell), não de polling.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'border border-border bg-popover text-popover-foreground text-sm',
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
