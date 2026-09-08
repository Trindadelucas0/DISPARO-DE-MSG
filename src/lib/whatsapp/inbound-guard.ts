import { parsePhone } from '@/lib/validation/phone';

/**
 * Regras puras de inbound WhatsApp. Testáveis sem Baileys e sem Prisma.
 */

const MESSAGE_WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
] as const;

export function normalizeInboundPhone(raw: string): string {
  const withoutDevice = raw.replace(/:\d+(?=@|$)/, '');
  const digits = withoutDevice.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
  return digits;
}

/** Só grava conversa com telefone BR válido (10/11 dígitos). JID @lid sem número cai fora. */
export function inboundStoredPhone(raw: string): string | null {
  return parsePhone(raw)?.digits ?? parsePhone(normalizeInboundPhone(raw))?.digits ?? null;
}

export function isLidJid(jid: string): boolean {
  return jid.includes('@lid');
}

/**
 * Preferir o JID de telefone (`@s.whatsapp.net`). Baileys 7 manda `@lid` em `remoteJid`
 * e o número real em `remoteJidAlt`.
 */
export function resolveInboundSender(remoteJid: string, remoteJidAlt?: string | null): string {
  const ordered = [remoteJidAlt, remoteJid].filter((value): value is string => Boolean(value));
  for (const jid of ordered) {
    if (jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
    if (isLidJid(jid)) continue;
    const phone = normalizeInboundPhone(jid);
    if (phone.length >= 10) return phone;
  }
  return normalizeInboundPhone(remoteJidAlt || remoteJid);
}

/** Baileys às vezes manda timestamp em segundos. */
export function toEpochMs(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? value * 1000 : value;
}

/**
 * Só mensagem nova após o pareamento. Folga de 5s por relógio do celular.
 * Sem connectedAt (ainda não conectou) → rejeita.
 */
export function shouldAcceptInbound(messageAtMs: number, connectedAtMs: number | null): boolean {
  if (!connectedAtMs) return false;
  return messageAtMs >= connectedAtMs - 5_000;
}

function unwrapBaileysMessage(
  message: Record<string, unknown> | null | undefined,
  depth = 0,
): Record<string, unknown> | null {
  if (!message || depth > 4) return message ?? null;
  for (const key of MESSAGE_WRAPPERS) {
    const wrap = message[key];
    if (wrap && typeof wrap === 'object' && wrap !== null && 'message' in wrap) {
      const inner = (wrap as { message?: Record<string, unknown> }).message;
      if (inner) return unwrapBaileysMessage(inner, depth + 1);
    }
  }
  return message;
}

function captionOf(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const caption = (value as { caption?: unknown }).caption;
  return typeof caption === 'string' ? caption.trim() : '';
}

export function inboundMediaKindFromBaileysMessage(
  message: Record<string, unknown> | null | undefined,
): 'IMAGE' | 'VIDEO' | 'AUDIO' | null {
  const inner = unwrapBaileysMessage(message);
  if (!inner) return null;
  if (inner.imageMessage) return 'IMAGE';
  if (inner.videoMessage) return 'VIDEO';
  if (inner.audioMessage) return 'AUDIO';
  return null;
}

export function inboundBodyFromBaileysMessage(message: Record<string, unknown> | null | undefined): string {
  const inner = unwrapBaileysMessage(message);
  if (!inner) return '';
  if (typeof inner.conversation === 'string' && inner.conversation.trim()) return inner.conversation;
  const extended = inner.extendedTextMessage;
  if (extended && typeof extended === 'object' && typeof (extended as { text?: string }).text === 'string') {
    const text = (extended as { text: string }).text.trim();
    if (text) return text;
  }
  const image = captionOf(inner.imageMessage);
  if (image) return image;
  const video = captionOf(inner.videoMessage);
  if (video) return video;
  const document = captionOf(inner.documentMessage);
  if (document) return document;
  if (inner.imageMessage) return 'Imagem';
  if (inner.videoMessage) return 'Vídeo';
  if (inner.audioMessage) return 'Áudio';
  if (inner.documentMessage) return 'Documento';
  if (inner.stickerMessage) return 'Figurinha';
  return '';
}

const MEDIA_PLACEHOLDERS = new Set(['Imagem', 'Vídeo', 'Áudio', 'Documento', 'Figurinha']);

export function inboundCaptionForStorage(body: string, hasMedia: boolean): string {
  if (!hasMedia) return body;
  return MEDIA_PLACEHOLDERS.has(body.trim()) ? '' : body;
}

export function inboundMediaMimeFromBaileysMessage(
  message: Record<string, unknown> | null | undefined,
): string | null {
  const inner = unwrapBaileysMessage(message);
  if (!inner) return null;
  const pick = (value: unknown) => {
    if (!value || typeof value !== 'object') return null;
    const mime = (value as { mimetype?: unknown }).mimetype;
    return typeof mime === 'string' && mime.trim() ? mime : null;
  };
  return pick(inner.imageMessage) ?? pick(inner.videoMessage) ?? pick(inner.audioMessage);
}
