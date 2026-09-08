import type { MediaKind } from '@prisma/client';

import { isOggOpus } from '@/lib/media/storage';

export type WhatsAppSendContent =
  | { readonly text: string }
  | { readonly image: Buffer; readonly caption?: string }
  | { readonly video: Buffer; readonly caption?: string }
  | { readonly audio: Buffer; readonly ptt: boolean; readonly mimetype: string };

export function buildWhatsAppSendContent(input: {
  body: string;
  media?: { kind: MediaKind; buffer: Buffer; mimeType: string } | null;
}): WhatsAppSendContent {
  if (!input.media) {
    return { text: input.body };
  }
  const caption = input.body.trim() || undefined;
  if (input.media.kind === 'IMAGE') {
    return caption ? { image: input.media.buffer, caption } : { image: input.media.buffer };
  }
  if (input.media.kind === 'VIDEO') {
    return caption ? { video: input.media.buffer, caption } : { video: input.media.buffer };
  }
  return {
    audio: input.media.buffer,
    mimetype: input.media.mimeType,
    ptt: isOggOpus(input.media.mimeType),
  };
}
