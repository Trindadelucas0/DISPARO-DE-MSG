/**
 * Parser de frames SSE (event + data). Usado pelo cliente no lugar de EventSource,
 * que neste app chega em /api/events sem o cookie de sessão (401) enquanto fetch
 * nas outras rotas autentica.
 */

export type SseFrame = {
  readonly event: string;
  readonly data: string;
};

export function consumeSse(buffer: string): { readonly rest: string; readonly frames: SseFrame[] } {
  const frames: SseFrame[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const normalized = part.replace(/\r\n/g, '\n').trim();
    if (!normalized) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of normalized.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    frames.push({ event, data: dataLines.join('\n') });
  }
  return { rest, frames };
}
