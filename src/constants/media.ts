import type { MediaKind, MessageKind } from '@prisma/client';

export const MEDIA_KIND_META: Readonly<
  Record<MediaKind, { readonly label: string; readonly accept: string }>
> = {
  IMAGE: { label: 'Foto', accept: 'image/jpeg,image/png,image/webp' },
  VIDEO: { label: 'Vídeo', accept: 'video/mp4' },
  AUDIO: { label: 'Áudio', accept: 'audio/ogg,audio/mpeg,audio/mp4,audio/webm,audio/wav' },
};

export function mediaKindLabel(kind: MediaKind | string): string {
  if (kind === 'IMAGE') return MEDIA_KIND_META.IMAGE.label;
  if (kind === 'VIDEO') return MEDIA_KIND_META.VIDEO.label;
  if (kind === 'AUDIO') return MEDIA_KIND_META.AUDIO.label;
  return 'Arquivo';
}

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 16 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 16 * 1024 * 1024;

export const MEDIA_ACCEPT_IMAGE = MEDIA_KIND_META.IMAGE.accept;
export const MEDIA_ACCEPT_VIDEO = MEDIA_KIND_META.VIDEO.accept;
export const MEDIA_ACCEPT_AUDIO = MEDIA_KIND_META.AUDIO.accept;
export const MEDIA_ACCEPT_TEMPLATE = `${MEDIA_ACCEPT_IMAGE},${MEDIA_ACCEPT_VIDEO}`;

export function messagePreviewFromMedia(body: string, kind: MessageKind | string): string {
  const trimmed = body.trim();
  if (trimmed) return trimmed.slice(0, 140);
  if (kind === 'IMAGE') return 'Foto';
  if (kind === 'VIDEO') return 'Vídeo';
  if (kind === 'AUDIO') return 'Áudio';
  return trimmed.slice(0, 140);
}

export function messageKindFromMedia(
  mediaKind: MediaKind | null | undefined,
  hasTemplate: boolean,
): Exclude<MessageKind, 'SYSTEM'> {
  if (mediaKind === 'IMAGE' || mediaKind === 'VIDEO' || mediaKind === 'AUDIO') return mediaKind;
  return hasTemplate ? 'TEMPLATE' : 'TEXT';
}
