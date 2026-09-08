import { describe, expect, it } from 'vitest';

import { inspectMedia, sanitizeMediaFileName, assertStorageKey } from '@/lib/media/storage';
import { canAccessMediaAsset } from '@/lib/media/access';
import { messageKindFromMedia, messagePreviewFromMedia } from '@/constants/media';

function jpegStub(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function pngStub(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function riffWebp(): Buffer {
  const buf = Buffer.alloc(16);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(8, 4);
  buf.write('WEBP', 8);
  return buf;
}

describe('media storage', () => {
  it('reconhece JPEG, PNG e WebP', () => {
    expect(inspectMedia(jpegStub()).kind).toBe('IMAGE');
    expect(inspectMedia(jpegStub()).mimeType).toBe('image/jpeg');
    expect(inspectMedia(pngStub()).mimeType).toBe('image/png');
    expect(inspectMedia(riffWebp()).mimeType).toBe('image/webp');
  });

  it('recusa SVG e HTML', () => {
    expect(() => inspectMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toThrow(
      /Formato não aceito/,
    );
    expect(() => inspectMedia(Buffer.from('<!DOCTYPE html><html></html>'))).toThrow(/Formato não aceito/);
  });

  it('recusa MIME declarado divergente do conteúdo', () => {
    expect(() => inspectMedia(jpegStub(), { declaredMime: 'video/mp4' })).toThrow(/não bate/);
  });

  it('bloqueia path traversal no storageKey', () => {
    expect(() => assertStorageKey('../etc/passwd')).toThrow(/inválido/);
    expect(() => assertStorageKey('abc.jpg')).toThrow(/inválido/);
    expect(() => assertStorageKey('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg')).not.toThrow();
  });

  it('sanitiza nome de arquivo', () => {
    expect(sanitizeMediaFileName('C:\\\\tmp\\\\foto<script>.jpg')).toBe('foto_script_.jpg');
    expect(sanitizeMediaFileName('')).toBe('arquivo');
  });
});

describe('media access', () => {
  it('USER lê o próprio upload solto', () => {
    expect(
      canAccessMediaAsset({
        userId: 'u1',
        role: 'USER',
        createdById: 'u1',
        attachedToTemplate: false,
        conversationInScope: false,
      }),
    ).toBe(true);
  });

  it('USER não lê upload de outro vendedor sem conversa no escopo', () => {
    expect(
      canAccessMediaAsset({
        userId: 'seller-a',
        role: 'USER',
        createdById: 'seller-b',
        attachedToTemplate: false,
        conversationInScope: false,
      }),
    ).toBe(false);
  });

  it('USER lê mídia da conversa que está no escopo', () => {
    expect(
      canAccessMediaAsset({
        userId: 'seller-a',
        role: 'USER',
        createdById: 'admin',
        attachedToTemplate: false,
        conversationInScope: true,
      }),
    ).toBe(true);
  });

  it('qualquer papel lê mídia de template', () => {
    expect(
      canAccessMediaAsset({
        userId: 'seller-a',
        role: 'USER',
        createdById: 'admin',
        attachedToTemplate: true,
        conversationInScope: false,
      }),
    ).toBe(true);
  });
});

describe('preview e kind da mensagem', () => {
  it('usa o texto quando existe; senão o rótulo da mídia', () => {
    expect(messagePreviewFromMedia('oi', 'IMAGE')).toBe('oi');
    expect(messagePreviewFromMedia('  ', 'IMAGE')).toBe('Foto');
    expect(messagePreviewFromMedia('', 'AUDIO')).toBe('Áudio');
  });

  it('kind da mensagem segue a mídia, senão template ou texto', () => {
    expect(messageKindFromMedia('VIDEO', true)).toBe('VIDEO');
    expect(messageKindFromMedia(null, true)).toBe('TEMPLATE');
    expect(messageKindFromMedia(null, false)).toBe('TEXT');
  });
});
