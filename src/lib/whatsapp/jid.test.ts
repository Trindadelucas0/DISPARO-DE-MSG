import { describe, expect, it } from 'vitest';

import { outboundWhatsAppJidCandidates, resolveOutboundWhatsAppJid } from '@/lib/whatsapp/jid';

describe('JID de envio WhatsApp', () => {
  it('prefixa DDI 55 em número nacional (o inbound tira o 55)', () => {
    expect(outboundWhatsAppJidCandidates('38998100827')).toEqual([
      '5538998100827@s.whatsapp.net',
      '553898100827@s.whatsapp.net',
    ]);
    expect(outboundWhatsAppJidCandidates('5538998100827')).toEqual([
      '5538998100827@s.whatsapp.net',
      '553898100827@s.whatsapp.net',
    ]);
    expect(outboundWhatsAppJidCandidates('5538998100827@s.whatsapp.net')).toEqual([
      '5538998100827@s.whatsapp.net',
      '553898100827@s.whatsapp.net',
    ]);
  });

  it('fixo de 10 dígitos não inventa nono dígito', () => {
    expect(outboundWhatsAppJidCandidates('1134871776')).toEqual(['551134871776@s.whatsapp.net']);
  });

  it('recusa lixo', () => {
    expect(outboundWhatsAppJidCandidates('123')).toEqual([]);
  });

  it('usa o JID que o WhatsApp confirmou (PN antigo sem o 9)', () => {
    const resolved = resolveOutboundWhatsAppJid({
      rawTo: '38998100827',
      lookup: [
        { jid: '5538998100827@s.whatsapp.net', exists: false },
        { jid: '553898100827@s.whatsapp.net', exists: true },
      ],
    });
    expect(resolved).toEqual({ ok: true, jid: '553898100827@s.whatsapp.net' });
  });

  it('falha em vez de fingir envio quando o número não existe', () => {
    const resolved = resolveOutboundWhatsAppJid({
      rawTo: '38998100827',
      lookup: [{ jid: '5538998100827@s.whatsapp.net', exists: false }],
    });
    expect(resolved.ok).toBe(false);
  });

  it('sem consulta, ainda manda com DDI 55 (nunca 38998100827@s.whatsapp.net)', () => {
    expect(resolveOutboundWhatsAppJid({ rawTo: '38998100827', lookup: null })).toEqual({
      ok: true,
      jid: '5538998100827@s.whatsapp.net',
    });
  });
});
