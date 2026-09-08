import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { MediaKind } from '@prisma/client';

import {
  AUDIO_MAX_BYTES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
} from '@/constants/media';

export class MediaStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaStorageError';
  }
}

const MEDIA_DIR = join(process.cwd(), 'data', 'media');

const STORAGE_EXT = ['jpg', 'png', 'webp', 'mp4', 'ogg', 'mp3', 'm4a', 'webm', 'wav'] as const;
type StorageExt = (typeof STORAGE_EXT)[number];

const STORAGE_KEY = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${STORAGE_EXT.join('|')})$`,
);

const MIME_BY_EXT: Record<StorageExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  wav: 'audio/wav',
};

export interface InspectedMedia {
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly extension: StorageExt;
  readonly sizeBytes: number;
  readonly fileName: string;
}

function looksLikeJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function looksLikePng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function looksLikeWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

function looksLikeMp4(buffer: Buffer): boolean {
  return buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
}

function looksLikeOgg(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'OggS';
}

function looksLikeWav(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  );
}

function looksLikeWebm(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
}

function looksLikeMp3(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  if (buffer.toString('ascii', 0, 3) === 'ID3') return true;
  const byte = buffer[1];
  return buffer[0] === 0xff && byte !== undefined && (byte & 0xe0) === 0xe0;
}

function detectFromBytes(buffer: Buffer): { kind: MediaKind; mimeType: string; extension: StorageExt } | null {
  if (looksLikeJpeg(buffer)) return { kind: 'IMAGE', mimeType: 'image/jpeg', extension: 'jpg' };
  if (looksLikePng(buffer)) return { kind: 'IMAGE', mimeType: 'image/png', extension: 'png' };
  if (looksLikeWebp(buffer)) return { kind: 'IMAGE', mimeType: 'image/webp', extension: 'webp' };
  if (looksLikeMp4(buffer)) return { kind: 'VIDEO', mimeType: 'video/mp4', extension: 'mp4' };
  if (looksLikeOgg(buffer)) return { kind: 'AUDIO', mimeType: 'audio/ogg', extension: 'ogg' };
  if (looksLikeWav(buffer)) return { kind: 'AUDIO', mimeType: 'audio/wav', extension: 'wav' };
  if (looksLikeWebm(buffer)) return { kind: 'AUDIO', mimeType: 'audio/webm', extension: 'webm' };
  if (looksLikeMp3(buffer)) return { kind: 'AUDIO', mimeType: 'audio/mpeg', extension: 'mp3' };
  return null;
}

const DECLARED_MIME: Record<string, { kind: MediaKind }> = {
  'image/jpeg': { kind: 'IMAGE' },
  'image/jpg': { kind: 'IMAGE' },
  'image/png': { kind: 'IMAGE' },
  'image/webp': { kind: 'IMAGE' },
  'video/mp4': { kind: 'VIDEO' },
  'audio/ogg': { kind: 'AUDIO' },
  'audio/mpeg': { kind: 'AUDIO' },
  'audio/mp3': { kind: 'AUDIO' },
  'audio/mp4': { kind: 'AUDIO' },
  'audio/webm': { kind: 'AUDIO' },
  'audio/wav': { kind: 'AUDIO' },
  'audio/x-wav': { kind: 'AUDIO' },
};

function maxBytesFor(kind: MediaKind): number {
  if (kind === 'IMAGE') return IMAGE_MAX_BYTES;
  if (kind === 'VIDEO') return VIDEO_MAX_BYTES;
  return AUDIO_MAX_BYTES;
}

export function sanitizeMediaFileName(raw: string): string {
  const base = basename(raw.replace(/\\/g, '/')).replace(/[^\w.\-()+ ]+/g, '_').trim();
  return base.slice(0, 120) || 'arquivo';
}

export function inspectMedia(
  buffer: Buffer,
  options: { declaredMime?: string | null; fileName?: string | null } = {},
): InspectedMedia {
  if (!buffer.length) {
    throw new MediaStorageError('O arquivo enviado está vazio.');
  }

  const detected = detectFromBytes(buffer);
  if (!detected) {
    throw new MediaStorageError(
      'Formato não aceito. Envie JPEG, PNG, WebP, MP4, OGG, MP3, M4A, WebM ou WAV.',
    );
  }

  let kind = detected.kind;
  let extension = detected.extension;

  const declared = options.declaredMime?.toLowerCase().split(';')[0]?.trim() ?? '';
  if (declared === 'audio/mp4' && (kind === 'VIDEO' || kind === 'AUDIO')) {
    kind = 'AUDIO';
    extension = 'm4a';
  } else if (declared && DECLARED_MIME[declared] && DECLARED_MIME[declared].kind !== kind) {
    throw new MediaStorageError('O tipo declarado do arquivo não bate com o conteúdo.');
  }

  const limit = maxBytesFor(kind);
  if (buffer.length > limit) {
    throw new MediaStorageError(
      `Arquivo acima do limite de ${Math.round(limit / 1024 / 1024)} MB para ${kind === 'IMAGE' ? 'foto' : kind === 'VIDEO' ? 'vídeo' : 'áudio'}.`,
    );
  }

  return {
    kind,
    mimeType: MIME_BY_EXT[extension],
    extension,
    sizeBytes: buffer.length,
    fileName: sanitizeMediaFileName(options.fileName ?? `arquivo.${extension}`),
  };
}

export function assertStorageKey(storageKey: string): string {
  if (!STORAGE_KEY.test(storageKey)) {
    throw new MediaStorageError('Identificador de mídia inválido.');
  }
  return storageKey;
}

export function mediaPathFor(storageKey: string): string {
  return join(MEDIA_DIR, assertStorageKey(storageKey));
}

export async function writeMediaFile(buffer: Buffer, inspected: InspectedMedia): Promise<string> {
  await mkdir(MEDIA_DIR, { recursive: true });
  const storageKey = `${randomUUID()}.${inspected.extension}`;
  await writeFile(mediaPathFor(storageKey), buffer);
  return storageKey;
}

export async function readMediaFile(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(mediaPathFor(storageKey));
  } catch {
    throw new MediaStorageError('O arquivo de mídia não está mais disponível.');
  }
}

export function isOggOpus(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return lower.includes('ogg') || lower.includes('opus');
}
