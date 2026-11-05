import { describe, expect, it } from 'vitest';

import { buildWhatsAppSendContent } from '@/lib/whatsapp/send-content';

const buf = Buffer.from([1, 2, 3]);

describe('buildWhatsAppSendContent', () => {
  it('manda só texto sem mídia', () => {
    expect(buildWhatsAppSendContent({ body: 'oi' })).toEqual({ text: 'oi' });
  });

  it('usa o texto como legenda da foto', () => {
    expect(
      buildWhatsAppSendContent({
        body: 'veja',
        media: { kind: 'IMAGE', buffer: buf, mimeType: 'image/jpeg' },
      }),
    ).toEqual({ image: buf, caption: 'veja' });
  });

  it('usa o texto como legenda do vídeo', () => {
    expect(
      buildWhatsAppSendContent({
        body: 'apresentação',
        media: { kind: 'VIDEO', buffer: buf, mimeType: 'video/mp4' },
      }),
    ).toEqual({ video: buf, caption: 'apresentação' });
  });

  it('áudio webm não vira nota de voz', () => {
    const content = buildWhatsAppSendContent({
      body: '',
      media: { kind: 'AUDIO', buffer: buf, mimeType: 'audio/webm' },
    });
    expect(content).toEqual({ audio: buf, mimetype: 'audio/webm', ptt: false });
  });

  it('ogg/opus marca ptt', () => {
    const content = buildWhatsAppSendContent({
      body: '',
      media: { kind: 'AUDIO', buffer: buf, mimeType: 'audio/ogg; codecs=opus' },
    });
    expect(content).toMatchObject({ ptt: true });
  });
});
