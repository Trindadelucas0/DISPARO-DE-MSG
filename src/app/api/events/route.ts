import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/rbac';
import { hasEventsRedis, listenDomainEvents } from '@/lib/events-bus';
import type { DomainEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

/**
 * Sem sessão devolve SSE vazio com `retry`, nunca 401 JSON.
 * 401 faz o cliente (e EventSource legado) reconectar em loop e lotar o terminal.
 */
function idleStream(): NextResponse {
  return new NextResponse('retry: 30000\nevent: idle\ndata: {}\n\n', {
    status: 200,
    headers: SSE_HEADERS,
  });
}

/**
 * SSE com fan-out Redis. Um subscriber por processo (`listenDomainEvents`);
 * cada aba só registra um listener local. Sem Redis, só heartbeat.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return idleStream();

  const encoder = new TextEncoder();
  let cleanup = (): void => undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const redis = hasEventsRedis();

      const send = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      send('retry: 15000\n');
      send(`event: hello\ndata: ${JSON.stringify({ redis })}\n\n`);

      const heartbeat = setInterval(() => {
        send(`event: ping\ndata: ${Date.now()}\n\n`);
      }, 25_000);

      const unsubscribe = listenDomainEvents((message) => {
        try {
          const event = JSON.parse(message) as DomainEvent;
          send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          send(`event: change\ndata: ${message}\n\n`);
        }
      });

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new NextResponse(stream, { headers: SSE_HEADERS });
}
