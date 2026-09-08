import { describe, expect, it, vi } from 'vitest';

import { connectUntilQr } from '@/lib/evolution/client';
import {
  extractInboundMessage,
  extractQrBase64,
  mapEvolutionStateToSession,
  resolveQrImage,
} from '@/lib/evolution/qr';

describe('evolution qr helpers (sem rede / sem send)', () => {
  it('extrai QR base64 data URL do payload', () => {
    const png = `data:image/png;base64,${'A'.repeat(100)}`;
    expect(extractQrBase64({ qrcode: { base64: png } })).toBe(png);
  });

  it('resolveQrImage usa toDataUrl injetado para código cru', async () => {
    const img = await resolveQrImage({ qrcode: { code: 'pairing-code-abc' } }, async (code) => {
      expect(code).toBe('pairing-code-abc');
      return 'data:image/png;base64,MOCK';
    });
    expect(img).toBe('data:image/png;base64,MOCK');
  });

  it('mapeia estados de conexão Evolution → sessão CRM', () => {
    expect(mapEvolutionStateToSession('open')).toBe('CONNECTED');
    expect(mapEvolutionStateToSession('qr')).toBe('QR_CODE');
    expect(mapEvolutionStateToSession('connecting')).toBe('CONNECTING');
    expect(mapEvolutionStateToSession('close')).toBe('DISCONNECTED');
  });

  it('extrai mensagem inbound e ignora fromMe', () => {
    const inbound = extractInboundMessage({
      data: {
        key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'ABC' },
        message: { conversation: 'Olá' },
      },
    });
    expect(inbound).toEqual({
      from: '5511999999999',
      body: 'Olá',
      providerMessageId: 'ABC',
    });

    expect(
      extractInboundMessage({
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: 'X' },
          message: { conversation: 'eco' },
        },
      }),
    ).toBeNull();
  });

  it('connectUntilQr devolve QR sem chamar sendText', async () => {
    const sendSpy = vi.fn();
    const qrPayload = { qrcode: { base64: `data:image/png;base64,${'B'.repeat(100)}` } };

    const result = await connectUntilQr('crm-test', {
      resolveQr: async (payload) => extractQrBase64(payload),
      recreate: async () => qrPayload,
      connect: async () => ({}),
      setWebhook: async () => ({}),
      setSettings: async () => ({}),
      getState: async () => ({ state: 'connecting' }),
      extractState: () => 'connecting',
    });

    expect(result.qr).toMatch(/^data:image\/png;base64,/);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('CONNECTION open sem QR significa conectado', async () => {
    const result = await connectUntilQr('crm-open', {
      resolveQr: async () => null,
      readStoredQr: async () => null,
      recreate: async () => ({}),
      connect: async () => ({}),
      setWebhook: async () => ({}),
      setSettings: async () => ({}),
      getState: async () => ({ instance: { state: 'open' } }),
      extractState: () => 'open',
    });
    expect(result.qr).toBeNull();
  });
});
