import { describe, expect, it } from 'vitest';

import { templateWriteSchema, whatsappSendSchema } from '@/features/messages/schema';

describe('template + envio com mídia', () => {
  it('aceita template só com foto', () => {
    const parsed = templateWriteSchema.parse({
      name: 'Foto oferta',
      channel: 'WHATSAPP',
      body: '',
      mediaId: 'clmedia123',
    });
    expect(parsed.mediaId).toBe('clmedia123');
  });

  it('recusa template sem texto e sem mídia', () => {
    const result = templateWriteSchema.safeParse({
      name: 'Vazio',
      channel: 'WHATSAPP',
      body: '',
    });
    expect(result.success).toBe(false);
  });

  it('aceita envio só com template (mídia resolvida no servidor)', () => {
    const parsed = whatsappSendSchema.parse({ templateId: 'tpl1', content: '' });
    expect(parsed.templateId).toBe('tpl1');
  });

  it('recusa envio sem texto e sem template', () => {
    expect(whatsappSendSchema.safeParse({ content: '' }).success).toBe(false);
  });
});
