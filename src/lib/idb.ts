/**
 * IndexedDB para preferências e templates (Fase 8).
 * Falha silenciosa: o sistema funciona sem persistência local.
 */

const DB_NAME = 'crm-prospeccao';
const DB_VERSION = 1;
const STORE = 'kv';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => resolve(undefined);
  });
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export const IDB_KEYS = {
  lastTemplateId: 'messages:lastTemplateId',
  templatesCache: 'messages:templates',
  contactsBucket: 'contacts:bucket',
  kanbanCompact: 'kanban:compact',
  kanbanShowClosed: 'kanban:showClosed',
} as const;
