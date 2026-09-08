/**
 * Sessão WhatsApp Web (Baileys) no processo worker.
 * O Next nunca abre socket — só publica comando no Redis.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rm, access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import QRCode from 'qrcode';

import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { readMediaFile } from '@/lib/media/storage';
import {
  inboundBodyFromBaileysMessage,
  inboundMediaKindFromBaileysMessage,
  inboundMediaMimeFromBaileysMessage,
  normalizeInboundPhone,
  resolveInboundSender,
  shouldAcceptInbound,
  toEpochMs,
} from '@/lib/whatsapp/inbound-guard';
import {
  createWhatsAppContactStore,
  ingestWhatsAppPayload,
  resolvePendingLidPhones,
  snapshotWhatsAppContacts,
  type WhatsAppContactStore,
} from '@/lib/whatsapp/contacts';
import { outboundWhatsAppJidCandidates, resolveOutboundWhatsAppJid } from '@/lib/whatsapp/jid';
import { buildWhatsAppSendContent, type WhatsAppSendContent } from '@/lib/whatsapp/send-content';
import {
  contactsReplyKey,
  sendReplyKey,
  WHATSAPP_SESSION_CHANNEL,
  type WhatsAppSessionCommand,
} from '@/lib/whatsapp/session-commands';
import {
  isBaileysSocketReady,
  sessionStatusAfterDisconnect,
  shouldReconnectAfterDisconnect,
  shouldWipeAuthOnDisconnect,
  WA_SESSION_OWNER_TTL_SEC,
  whatsappSessionOwnerKey,
} from '@/lib/whatsapp/session-status';
import { prisma } from '@/lib/db';
import { persistMediaBuffer } from '@/server/services/media.service';
import { enqueueWhatsappInbound } from '@/server/queue/enqueue';
import { createBullConnection, getSharedBullConnection } from '@/server/queue/connection';

type WASocket = {
  ev: {
    on: (event: string, cb: (...args: never[]) => void) => void;
  };
  user?: { id?: string | null } | null;
  end: (error?: Error) => void;
  logout: () => Promise<void>;
  sendMessage: (
    jid: string,
    content: WhatsAppSendContent,
  ) => Promise<{ key?: { id?: string | null } } | undefined>;
  onWhatsApp: (...phoneNumber: string[]) => Promise<
    | {
        jid: string;
        exists: boolean;
      }[]
    | undefined
  >;
  signalRepository?: {
    lidMapping?: {
      getPNForLID?: (lid: string) => Promise<string | null | undefined> | string | null | undefined;
      getPNsForLIDs?: (
        lids: string[],
      ) => Promise<Array<{ lid: string; pn: string }> | null | undefined>;
    };
  };
  resyncAppState?: (
    collections: readonly string[],
    isInitialSync: boolean,
  ) => Promise<void>;
  fetchBlocklist?: () => Promise<(string | undefined)[]>;
};

type Active = {
  sock: WASocket;
  accountId: string;
};

const sockets = new Map<string, Active>();
const contactStores = new Map<string, WhatsAppContactStore>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();
const starting = new Set<string>();
const WORKER_ID = randomUUID();

async function acquireSessionLock(accountId: string): Promise<boolean> {
  const redis = getSharedBullConnection();
  const key = whatsappSessionOwnerKey(accountId);
  const ok = await redis.set(key, WORKER_ID, 'EX', WA_SESSION_OWNER_TTL_SEC, 'NX');
  if (ok === 'OK') return true;
  const owner = await redis.get(key);
  if (owner === WORKER_ID) {
    await redis.expire(key, WA_SESSION_OWNER_TTL_SEC);
    return true;
  }
  return false;
}

async function refreshSessionLock(accountId: string): Promise<boolean> {
  const redis = getSharedBullConnection();
  const key = whatsappSessionOwnerKey(accountId);
  const owner = await redis.get(key);
  if (owner !== WORKER_ID) return false;
  await redis.expire(key, WA_SESSION_OWNER_TTL_SEC);
  return true;
}

async function releaseSessionLock(accountId: string): Promise<void> {
  const redis = getSharedBullConnection();
  const key = whatsappSessionOwnerKey(accountId);
  const owner = await redis.get(key);
  if (owner === WORKER_ID) await redis.del(key);
}

function contactStoreFor(accountId: string): WhatsAppContactStore {
  const existing = contactStores.get(accountId);
  if (existing) return existing;
  const created = createWhatsAppContactStore();
  contactStores.set(accountId, created);
  return created;
}

function ownAccountPhone(accountId: string): string | null {
  const id = sockets.get(accountId)?.sock.user?.id;
  if (!id) return null;
  const phone = normalizeInboundPhone(id);
  return phone.length >= 10 ? phone : null;
}

function contactCacheFile(accountId: string): string {
  return path.join(authDir(accountId), 'contact-cache.json');
}

async function loadContactCache(accountId: string): Promise<void> {
  try {
    const raw = await readFile(contactCacheFile(accountId), 'utf8');
    const parsed = JSON.parse(raw) as { contacts?: Array<{ phone: string; name: string }> };
    const rows = parsed.contacts ?? [];
    if (rows.length === 0) return;
    ingestWhatsAppPayload(
      contactStoreFor(accountId),
      rows.map((row) => ({
        id: `${row.phone.replace(/\D/g, '')}@s.whatsapp.net`,
        name: row.name,
      })),
    );
    console.log('[baileys] contact-cache carregado', { accountId, contacts: rows.length });
  } catch {
    /* primeira sessão */
  }
}

function schedulePersistContacts(accountId: string): void {
  const previous = persistTimers.get(accountId);
  if (previous) clearTimeout(previous);
  persistTimers.set(
    accountId,
    setTimeout(() => {
      persistTimers.delete(accountId);
      const snap = snapshotWhatsAppContacts(contactStoreFor(accountId));
      if (snap.contacts.length === 0) return;
      void writeFile(
        contactCacheFile(accountId),
        JSON.stringify({ contacts: snap.contacts }),
      ).catch((error: Error) => {
        console.error('[baileys] contact-cache:', error.message);
      });
    }, 500),
  );
}

function ingestAccountParties(accountId: string, payload: unknown): void {
  const store = contactStoreFor(accountId);
  const before = store.byPhone.size;
  ingestWhatsAppPayload(store, payload, ownAccountPhone(accountId));
  if (store.byPhone.size !== before) {
    console.log('[baileys] contacts', {
      accountId,
      phones: store.byPhone.size,
      pending: store.pendingLids.size,
    });
    schedulePersistContacts(accountId);
  }
}

async function pnForLid(sock: WASocket, lid: string): Promise<string | null> {
  const mapping = sock.signalRepository?.lidMapping;
  if (!mapping?.getPNForLID) return null;
  try {
    const result = await mapping.getPNForLID(lid);
    return result ?? null;
  } catch {
    return null;
  }
}

async function resolveAccountPendingLids(
  store: WhatsAppContactStore,
  sock: WASocket,
  ownPhone: string | null,
): Promise<void> {
  const lids = [...store.pendingLids.keys()];
  if (lids.length === 0) return;
  const mapping = sock.signalRepository?.lidMapping;
  if (mapping?.getPNsForLIDs) {
    try {
      const pairs = (await mapping.getPNsForLIDs(lids)) ?? [];
      const byLid = new Map(pairs.map((pair) => [pair.lid, pair.pn]));
      await resolvePendingLidPhones(
        store,
        async (lid) => byLid.get(lid) ?? null,
        ownPhone,
      );
    } catch {
      // cai no lookup um a um
    }
  }
  if (store.pendingLids.size > 0) {
    await resolvePendingLidPhones(store, (lid) => pnForLid(sock, lid), ownPhone);
  }
}

function authDir(accountId: string): string {
  return path.join(process.cwd(), 'data', 'whatsapp-auth', accountId);
}

async function hasAuth(accountId: string): Promise<boolean> {
  try {
    await access(path.join(authDir(accountId), 'creds.json'));
    return true;
  } catch {
    return false;
  }
}

function clearReconnect(accountId: string) {
  const timer = reconnectTimers.get(accountId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(accountId);
}

function stopHeartbeat(accountId: string) {
  const timer = heartbeats.get(accountId);
  if (timer) clearInterval(timer);
  heartbeats.delete(accountId);
}

function startHeartbeat(accountId: string) {
  stopHeartbeat(accountId);
  const timer = setInterval(() => {
    void (async () => {
      const active = sockets.get(accountId);
      if (!isBaileysSocketReady(active?.sock.user?.id)) {
        stopHeartbeat(accountId);
        return;
      }
      const owned = await refreshSessionLock(accountId);
      if (!owned) {
        console.log('[baileys] perdeu dono da sessão', accountId);
        stopHeartbeat(accountId);
        sockets.delete(accountId);
        return;
      }
      await touchAccount(
        accountId,
        {
          sessionStatus: 'CONNECTED',
          status: 'ACTIVE',
          lastHeartbeatAt: new Date(),
        },
        true,
      ).catch(() => undefined);
    })();
  }, 30_000);
  heartbeats.set(accountId, timer);
}

function scheduleReconnect(accountId: string, delayMs = 1_500) {
  if (reconnectTimers.has(accountId)) return;
  const timer = setTimeout(() => {
    reconnectTimers.delete(accountId);
    void startSocket(accountId).catch(async (error: Error) => {
      console.error('[baileys] reconnect:', accountId, error.message);
      await touchAccount(accountId, {
        sessionStatus: 'FAILED',
        status: 'ERROR',
        qrCode: null,
        lastHeartbeatAt: new Date(),
      }).catch(() => undefined);
    });
  }, delayMs);
  reconnectTimers.set(accountId, timer);
}

function disconnectStatusCode(
  error: { output?: { statusCode?: number }; message?: string } | undefined,
  restartRequired: number,
): number | undefined {
  const code = error?.output?.statusCode;
  if (typeof code === 'number') return code;
  if (error?.message && /restart required/i.test(error.message)) return restartRequired;
  return undefined;
}

function quietBaileysLogger() {
  const emit = (level: 'warn' | 'error') => (obj: unknown, msg?: string) => {
    const text = typeof obj === 'string' ? obj : (msg ?? '');
    if (!text) return;
    if (level === 'warn') console.warn('[baileys]', text);
    else console.error('[baileys]', text);
  };
  const logger = {
    level: 'warn',
    child(_ctx?: unknown) {
      return logger;
    },
    trace() {},
    debug() {},
    info() {},
    warn: emit('warn'),
    error: emit('error'),
    fatal: emit('error'),
  };
  return logger;
}

async function touchAccount(
  accountId: string,
  data: {
    sessionStatus?: 'DISCONNECTED' | 'CONNECTING' | 'QR_CODE' | 'CONNECTED' | 'FAILED';
    qrCode?: string | null;
    phone?: string | null;
    lastHeartbeatAt?: Date;
    lastConnectedAt?: Date | null;
    status?: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  },
  silent = false,
) {
  await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: {
      ...(data.sessionStatus ? { sessionStatus: data.sessionStatus } : {}),
      ...(data.qrCode !== undefined ? { qrCode: data.qrCode } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.lastHeartbeatAt ? { lastHeartbeatAt: data.lastHeartbeatAt } : {}),
      ...(data.lastConnectedAt !== undefined ? { lastConnectedAt: data.lastConnectedAt } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
  });
  if (silent) return;
  await notifyChange({
    type: 'whatsapp.session',
    tags: MUTATION_TAGS.whatsapp,
    entityId: accountId,
  });
}

async function destroySocket(accountId: string, logout: boolean) {
  clearReconnect(accountId);
  stopHeartbeat(accountId);
  const current = sockets.get(accountId);
  sockets.delete(accountId);
  if (current) {
    try {
      if (logout) await current.sock.logout();
      else current.sock.end(undefined);
    } catch {
      /* já fechou */
    }
  }
  if (logout) {
    await rm(authDir(accountId), { recursive: true, force: true });
    await releaseSessionLock(accountId);
    contactStores.delete(accountId);
  }
}

async function startSocket(accountId: string) {
  if (starting.has(accountId)) return;
  const owned = await acquireSessionLock(accountId);
  if (!owned) {
    console.log('[baileys] outro worker já é dono da sessão', accountId);
    return;
  }
  starting.add(accountId);
  try {
    await destroySocket(accountId, false);
    await mkdir(authDir(accountId), { recursive: true });
    await loadContactCache(accountId);
    await touchAccount(accountId, {
      sessionStatus: 'CONNECTING',
      qrCode: null,
      status: 'INACTIVE',
      lastHeartbeatAt: new Date(),
    });

  const baileys = await import('@whiskeysockets/baileys');
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
    baileys;
  const { state, saveCreds } = await useMultiFileAuthState(authDir(accountId));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1025190524] as [number, number, number],
  }));

  const sock = makeWASocket({
    version,
    auth: state,
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    countryCode: 'BR',
    markOnlineOnConnect: false,
    logger: quietBaileysLogger() as never,
  }) as unknown as WASocket;

  sockets.set(accountId, { sock, accountId });

  let savingCreds: Promise<void> = Promise.resolve();
  sock.ev.on(
    'creds.update',
    ((async () => {
      savingCreds = Promise.resolve(saveCreds());
      await savingCreds;
    }) as never),
  );

    sock.ev.on('connection.update', (async (update: {
      connection?: string;
      lastDisconnect?: { error?: { output?: { statusCode?: number }; message?: string } };
      qr?: string;
    }) => {
      console.log('[baileys] connection.update', {
        accountId,
        connection: update.connection ?? null,
        hasQr: Boolean(update.qr),
        disconnect: update.lastDisconnect?.error?.message ?? null,
      });
      if (update.qr) {
        const qrCode = await QRCode.toDataURL(update.qr, { width: 320, margin: 1 });
        await touchAccount(accountId, {
          sessionStatus: 'QR_CODE',
          qrCode,
          lastHeartbeatAt: new Date(),
        });
        return;
      }

      if (update.connection === 'open') {
        const current = sockets.get(accountId);
        const row = await prisma.whatsAppAccount.findUnique({
          where: { id: accountId },
          select: { lastConnectedAt: true },
        });
        const phone = current?.sock.user?.id
          ? normalizeInboundPhone(current.sock.user.id)
          : undefined;
        await touchAccount(accountId, {
          sessionStatus: 'CONNECTED',
          qrCode: null,
          status: 'ACTIVE',
          lastHeartbeatAt: new Date(),
          lastConnectedAt: row?.lastConnectedAt ?? new Date(),
          ...(phone && phone.length >= 10 ? { phone } : {}),
        });
        startHeartbeat(accountId);
        return;
      }

      if (update.connection === 'close') {
        const current = sockets.get(accountId);
        if (current && current.sock !== sock) return;
        if (current?.sock === sock) sockets.delete(accountId);
        stopHeartbeat(accountId);

        const code = disconnectStatusCode(
          update.lastDisconnect?.error,
          DisconnectReason.restartRequired,
        );
        const authWiped = shouldWipeAuthOnDisconnect(code);
        const shouldReconnect = shouldReconnectAfterDisconnect({
          authWiped,
          starting: starting.has(accountId),
        });

        if (authWiped) {
          await rm(authDir(accountId), { recursive: true, force: true });
          await releaseSessionLock(accountId);
        }

        await savingCreds.catch(() => undefined);

        if (shouldReconnect) {
          console.log('[baileys] reconectando', { accountId, code: code ?? null });
          scheduleReconnect(accountId);
        }

        await touchAccount(accountId, {
          sessionStatus: sessionStatusAfterDisconnect(authWiped),
          qrCode: null,
          status: authWiped ? 'INACTIVE' : 'ACTIVE',
          lastHeartbeatAt: new Date(),
        }).catch((error: Error) => {
          console.error('[baileys] touchAccount close:', accountId, error.message);
        });
      }
    }) as never);

    sock.ev.on('messages.upsert', (async (upsert: {
      type?: string;
      messages?: Array<{
        key?: {
          remoteJid?: string | null;
          remoteJidAlt?: string | null;
          fromMe?: boolean | null;
          id?: string | null;
        };
        messageTimestamp?: number | { toNumber?: () => number };
        message?: Record<string, unknown> | null;
        pushName?: string | null;
      }>;
    }) => {
      const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      const connectedAt = account?.lastConnectedAt?.getTime() ?? null;

      for (const msg of upsert.messages ?? []) {
        ingestAccountParties(accountId, {
          id: msg.key?.remoteJid,
          jidAlt: msg.key?.remoteJidAlt,
          phoneNumber: msg.key?.remoteJidAlt,
          name: msg.pushName,
        });
        if (msg.key?.fromMe) continue;
        const jid = msg.key?.remoteJid ?? '';
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) {
          continue;
        }
        const rawTs =
          typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : msg.messageTimestamp && typeof msg.messageTimestamp.toNumber === 'function'
              ? msg.messageTimestamp.toNumber()
              : null;
        const messageAt = toEpochMs(rawTs) ?? Date.now();
        if (!shouldAcceptInbound(messageAt, connectedAt)) {
          console.log('[baileys] inbound ignorado (antes do pareamento)', {
            accountId,
            type: upsert.type ?? null,
          });
          continue;
        }

        const mediaKind = inboundMediaKindFromBaileysMessage(msg.message ?? undefined);
        const body = inboundBodyFromBaileysMessage(msg.message ?? undefined).trim();
        if (!body && !mediaKind) {
          console.log('[baileys] inbound ignorado (sem texto)', { accountId });
          continue;
        }

        const from = resolveInboundSender(jid, msg.key?.remoteJidAlt);
        if (from.length < 10) {
          console.log('[baileys] inbound ignorado (jid sem telefone)', { accountId });
          continue;
        }

        let mediaId: string | undefined;
        let kind: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' = mediaKind ?? 'TEXT';
        if (mediaKind) {
          try {
            const downloadMediaMessage = (
              baileys as {
                downloadMediaMessage?: (
                  message: unknown,
                  type: 'buffer',
                  options?: object,
                ) => Promise<Buffer>;
              }
            ).downloadMediaMessage;
            const downloaded = downloadMediaMessage
              ? await downloadMediaMessage(msg, 'buffer', {})
              : null;
            const buffer = downloaded
              ? Buffer.isBuffer(downloaded)
                ? downloaded
                : Buffer.from(downloaded)
              : null;
            if (buffer && buffer.length > 0) {
              const saved = await persistMediaBuffer({
                buffer,
                declaredMime: inboundMediaMimeFromBaileysMessage(msg.message ?? undefined),
                fileName:
                  mediaKind === 'IMAGE' ? 'foto.jpg' : mediaKind === 'VIDEO' ? 'video.mp4' : 'audio.ogg',
                allowKinds: ['IMAGE', 'VIDEO', 'AUDIO'],
              });
              mediaId = saved.id;
              kind = saved.kind;
            }
          } catch (error) {
            console.error('[baileys] inbound media:', (error as Error).message);
          }
        }

        console.log('[baileys] inbound', { accountId, fromLength: from.length, kind });
        await enqueueWhatsappInbound({
          accountId,
          from,
          body,
          providerMessageId: String(msg.key?.id ?? `baileys:${accountId}:${messageAt}`),
          receivedAt: new Date(messageAt).toISOString(),
          mediaId,
          kind,
        }).catch((error: Error) => {
          console.error('[baileys] inbound enqueue:', error.message);
        });
      }
    }) as never);

    sock.ev.on('contacts.upsert', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('contacts.update', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('contacts.set', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('chats.upsert', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('chats.update', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('chats.set', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('messaging-history.set', ((payload: unknown) => {
      ingestAccountParties(accountId, payload);
    }) as never);
    sock.ev.on('lid-mapping.update', ((pair: { lid?: string; pn?: string }) => {
      ingestAccountParties(accountId, {
        id: pair.lid,
        lid: pair.lid,
        phoneNumber: pair.pn,
      });
    }) as never);
  } finally {
    starting.delete(accountId);
  }
}

async function waitForSocket(accountId: string, ms: number): Promise<Active | undefined> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const active = sockets.get(accountId);
    if (isBaileysSocketReady(active?.sock.user?.id)) return active;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const active = sockets.get(accountId);
  return isBaileysSocketReady(active?.sock.user?.id) ? active : undefined;
}

async function handleSend(command: Extract<WhatsAppSessionCommand, { action: 'send' }>) {
  const redis = createBullConnection();
  const key = sendReplyKey(command.requestId);
  let active = sockets.get(command.accountId);
  if (!isBaileysSocketReady(active?.sock.user?.id)) {
    const owned = await acquireSessionLock(command.accountId);
    if (!owned) {
      redis.disconnect();
      return;
    }
    if (!starting.has(command.accountId)) {
      void startSocket(command.accountId).catch((error: Error) => {
        console.error('[baileys] send/connect:', error.message);
      });
    }
    active = await waitForSocket(command.accountId, 12_000);
  }
  try {
    if (!active) {
      const pending = sockets.get(command.accountId);
      await redis.set(
        key,
        JSON.stringify({
          ok: false,
          error: pending
            ? 'WhatsApp ainda está conectando. Espere a sessão ficar Conectada e envie de novo.'
            : 'Sessão WhatsApp desconectada. Abra WhatsApp, clique Conectar e deixe o container crm-worker ligado.',
        }),
        'EX',
        30,
      );
      return;
    }
    const numbers = outboundWhatsAppJidCandidates(command.to).map((jid) =>
      jid.replace(/@s\.whatsapp\.net$/, ''),
    );
    let lookup: { jid: string; exists: boolean }[] | null | undefined = null;
    try {
      lookup = numbers.length ? ((await active.sock.onWhatsApp(...numbers)) ?? []) : [];
    } catch (error) {
      console.error('[baileys] onWhatsApp:', (error as Error).message);
      lookup = undefined;
    }
    const resolved = resolveOutboundWhatsAppJid({ rawTo: command.to, lookup });
    if (!resolved.ok) {
      await redis.set(key, JSON.stringify({ ok: false, error: resolved.error }), 'EX', 30);
      return;
    }
    console.log('[baileys] send', {
      accountId: command.accountId,
      jidHost: resolved.jid.includes('@lid') ? 'lid' : 'pn',
      hasMedia: Boolean(command.mediaId),
    });
    let media: { kind: 'IMAGE' | 'VIDEO' | 'AUDIO'; buffer: Buffer; mimeType: string } | null = null;
    if (command.mediaId) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: command.mediaId } });
      if (!asset) {
        await redis.set(
          key,
          JSON.stringify({ ok: false, error: 'Arquivo de mídia não encontrado.' }),
          'EX',
          30,
        );
        return;
      }
      media = {
        kind: asset.kind,
        buffer: await readMediaFile(asset.storageKey),
        mimeType: asset.mimeType,
      };
    }
    const result = await active.sock.sendMessage(
      resolved.jid,
      buildWhatsAppSendContent({ body: command.body, media }),
    );
    const id = result?.key?.id;
    if (!id) {
      await redis.set(
        key,
        JSON.stringify({ ok: false, error: 'WhatsApp não confirmou o envio.' }),
        'EX',
        30,
      );
      return;
    }
    await redis.set(key, JSON.stringify({ ok: true, providerMessageId: id }), 'EX', 30);
    await refreshSessionLock(command.accountId).catch(() => undefined);
    await touchAccount(command.accountId, {
      sessionStatus: 'CONNECTED',
      status: 'ACTIVE',
      lastHeartbeatAt: new Date(),
    }).catch(() => undefined);
  } catch (error) {
    await redis.set(
      key,
      JSON.stringify({ ok: false, error: (error as Error).message || 'Falha ao enviar.' }),
      'EX',
      30,
    );
  } finally {
    redis.disconnect();
  }
}

async function handleListContacts(
  command: Extract<WhatsAppSessionCommand, { action: 'list-contacts' }>,
) {
  const redis = createBullConnection();
  const key = contactsReplyKey(command.requestId);
  try {
    let active = sockets.get(command.accountId);
    if (!isBaileysSocketReady(active?.sock.user?.id)) {
      const owner = await getSharedBullConnection().get(whatsappSessionOwnerKey(command.accountId));
      if (owner && owner !== WORKER_ID) return;
      active = await waitForSocket(command.accountId, 5_000);
    }
    if (!active || !isBaileysSocketReady(active.sock.user?.id)) {
      await redis.set(
        key,
        JSON.stringify({
          ok: false,
          error:
            'Sessão WhatsApp desconectada. Abra WhatsApp, clique Conectar e deixe o container crm-worker ligado.',
        }),
        'EX',
        60,
      );
      return;
    }

    const store = contactStoreFor(command.accountId);
    const sock = active.sock;
    const ownPhone = ownAccountPhone(command.accountId);

    console.log('[baileys] list-contacts sync', {
      accountId: command.accountId,
      phones: store.byPhone.size,
      pending: store.pendingLids.size,
    });

    if (typeof sock.resyncAppState === 'function') {
      try {
        await sock.resyncAppState(
          ['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular'],
          true,
        );
      } catch (error) {
        console.warn('[baileys] resyncAppState:', (error as Error).message);
      }
    }

    if (typeof sock.fetchBlocklist === 'function') {
      try {
        const blocked = await sock.fetchBlocklist();
        ingestAccountParties(
          command.accountId,
          (blocked ?? []).flatMap((id) => (id ? [{ id }] : [])),
        );
      } catch (error) {
        console.warn('[baileys] fetchBlocklist:', (error as Error).message);
      }
    }

    await resolveAccountPendingLids(store, sock, ownPhone);

    let lastCount = -1;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await resolveAccountPendingLids(store, sock, ownPhone);
      const count = store.byPhone.size;
      if (count > 0 && count === lastCount && store.pendingLids.size === 0) break;
      lastCount = count;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const snap = snapshotWhatsAppContacts(store);
    console.log('[baileys] list-contacts', {
      accountId: command.accountId,
      contacts: snap.contacts.length,
      skipped: snap.skipped,
      pending: store.pendingLids.size,
    });
    await redis.set(
      key,
      JSON.stringify({ ok: true, contacts: snap.contacts, skipped: snap.skipped }),
      'EX',
      60,
    );
  } catch (error) {
    await redis.set(
      key,
      JSON.stringify({
        ok: false,
        error: (error as Error).message || 'Falha ao listar contatos.',
      }),
      'EX',
      60,
    );
  } finally {
    redis.disconnect();
  }
}

export async function startBaileysSessionWorker(): Promise<void> {
  const sub = createBullConnection();
  await sub.subscribe(WHATSAPP_SESSION_CHANNEL);
  sub.on('message', (_channel, raw) => {
    void (async () => {
      let command: WhatsAppSessionCommand;
      try {
        command = JSON.parse(raw) as WhatsAppSessionCommand;
      } catch {
        return;
      }
      if (command.action === 'connect') {
        try {
          await startSocket(command.accountId);
        } catch (error) {
          console.error('[baileys] connect:', error);
          await touchAccount(command.accountId, {
            sessionStatus: 'FAILED',
            status: 'ERROR',
            qrCode: null,
            lastHeartbeatAt: new Date(),
          }).catch(() => undefined);
        }
        return;
      }
      if (command.action === 'disconnect') {
        await destroySocket(command.accountId, true);
        await touchAccount(command.accountId, {
          sessionStatus: 'DISCONNECTED',
          qrCode: null,
          status: 'INACTIVE',
          lastHeartbeatAt: new Date(),
        }).catch(() => undefined);
        return;
      }
      if (command.action === 'send') {
        await handleSend(command);
        return;
      }
      if (command.action === 'list-contacts') {
        await handleListContacts(command);
      }
    })();
  });
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { provider: 'BAILEYS' },
    select: { id: true, sessionStatus: true },
  });
  for (const row of accounts) {
    const resume =
      row.sessionStatus === 'CONNECTED' ||
      row.sessionStatus === 'CONNECTING' ||
      row.sessionStatus === 'QR_CODE' ||
      (await hasAuth(row.id));
    if (!resume) continue;
    console.log('[baileys] retomando sessão', row.id, row.sessionStatus);
    void startSocket(row.id).catch(async (error: Error) => {
      console.error('[baileys] retomar sessão:', row.id, error.message);
      await touchAccount(row.id, {
        sessionStatus: 'FAILED',
        status: 'ERROR',
        qrCode: null,
        lastHeartbeatAt: new Date(),
      }).catch(() => undefined);
    });
  }

  console.log('[worker] sessão Baileys escutando', WHATSAPP_SESSION_CHANNEL);
}
