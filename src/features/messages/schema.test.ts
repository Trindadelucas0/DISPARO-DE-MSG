import { describe, expect, it } from 'vitest';

import {
  templatePatchSchema,
  templateWriteSchema,
  whatsappSendSchema,
} from '@/features/messages/schema';
import { prepareTemplateSaveRequest } from '@/features/messages/template-request';

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

  it('não envia o id da rota no corpo ao editar um template', () => {
    const request = prepareTemplateSaveRequest({
      id: 'tpl1',
      name: 'Pesquisa — cuidados com cães',
      channel: 'WHATSAPP',
      subject: null,
      body: 'Texto atualizado',
      mediaId: 'media1',
    });

    expect(request.id).toBe('tpl1');
    expect(request.body).not.toHaveProperty('id');
    expect(templatePatchSchema.safeParse(request.body).success).toBe(true);
  });
});
