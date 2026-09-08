/**
 * Mapa tag de domínio → query keys do TanStack Query.
 *
 * Servidor publica tags em `notifyChange`. O EventsBridge e as mutações da
 * mesma aba usam esta função para não deixar tela órfã (Kanban, Supervisão,
 * timeline, importação).
 *
 * Sem imports de Node: este módulo também roda no cliente.
 */

export function queryKeysForEventTags(
  tags: readonly string[],
): readonly (readonly string[])[] {
  const keys: string[][] = [];
  const seen = new Set<string>();
  const add = (key: readonly string[]) => {
    const id = key.join('\0');
    if (seen.has(id)) return;
    seen.add(id);
    keys.push([...key]);
  };

  for (const tag of tags) {
    if (tag === 'leads' || tag.startsWith('lead:')) {
      add(['leads']);
      add(['kanban']);
      add(['interactions']);
    }
    if (tag === 'dashboard') add(['dashboard']);
    if (tag === 'follow-ups') add(['follow-ups']);
    if (tag === 'contacts') add(['contacts']);
    if (tag === 'templates') add(['templates']);
    if (tag === 'reports') add(['reports']);
    if (tag === 'users') add(['users']);
    if (tag === 'campaigns') add(['campaigns']);
    if (tag === 'conversations') {
      add(['conversations']);
      add(['admin']);
    }
    if (tag === 'whatsapp') add(['whatsapp']);
    if (tag === 'import-jobs') add(['import']);
  }

  return keys;
}
