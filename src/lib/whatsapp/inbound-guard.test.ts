import { describe, expect, it } from 'vitest';

import {
  inboundBodyFromBaileysMessage,
  inboundCaptionForStorage,
  inboundMediaKindFromBaileysMessage,
  normalizeInboundPhone,
  resolveInboundSender,
  shouldAcceptInbound,
  toEpochMs,
} from '@/lib/whatsapp/inbound-guard';
import { clientQrCode } from '@/constants/whatsapp';

describe('inbound WhatsApp (sem Baileys, sem rede)', () => {
  it('normaliza JID e DDI 55', () => {
    expect(normalizeInboundPhone('5511987654321@s.whatsapp.net')).toBe('11987654321');
    expect(normalizeInboundPhone('11987654321')).toBe('11987654321');
  });

  it('ignora sufixo de device no JID (:2)', () => {
    expect(normalizeInboundPhone('553898100827:2@s.whatsapp.net')).toBe('3898100827');
    expect(normalizeInboundPhone('5511987654321:1@s.whatsapp.net')).toBe('11987654321');
  });

  it('converte timestamp de segundos para ms', () => {
    expect(toEpochMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs(null)).toBeNull();
  });

  it('rejeita mensagem anterior ao pareamento', () => {
    const connectedAt = Date.parse('2026-09-03T12:00:00.000Z');
    expect(shouldAcceptInbound(connectedAt - 10_000, connectedAt)).toBe(false);
    expect(shouldAcceptInbound(connectedAt, connectedAt)).toBe(true);
    expect(shouldAcceptInbound(connectedAt + 1_000, connectedAt)).toBe(true);
    expect(shouldAcceptInbound(connectedAt, null)).toBe(false);
  });

  it('classifica mídia do evento Baileys', () => {
    expect(inboundMediaKindFromBaileysMessage({ imageMessage: {} })).toBe('IMAGE');
    expect(inboundMediaKindFromBaileysMessage({ videoMessage: {} })).toBe('VIDEO');
    expect(inboundMediaKindFromBaileysMessage({ audioMessage: {} })).toBe('AUDIO');
    expect(inboundMediaKindFromBaileysMessage({ conversation: 'oi' })).toBeNull();
  });

  it('guarda legenda real e descarta rótulo Imagem quando há arquivo', () => {
    expect(inboundCaptionForStorage('Imagem', true)).toBe('');
    expect(inboundCaptionForStorage('veja isso', true)).toBe('veja isso');
    expect(inboundCaptionForStorage('Imagem', false)).toBe('Imagem');
  });

  it('extrai texto do evento Baileys mockado', () => {
    expect(inboundBodyFromBaileysMessage({ conversation: 'oi' })).toBe('oi');
    expect(
      inboundBodyFromBaileysMessage({ extendedTextMessage: { text: 'olá' } }),
    ).toBe('olá');
    expect(
      inboundBodyFromBaileysMessage({
        ephemeralMessage: { message: { conversation: 'efêmera' } },
      }),
    ).toBe('efêmera');
    expect(inboundBodyFromBaileysMessage({ imageMessage: {} })).toBe('Imagem');
    expect(inboundBodyFromBaileysMessage({})).toBe('');
  });

  it('usa remoteJidAlt quando o chat é LID', () => {
    expect(
      resolveInboundSender('53455246884964@lid', '5538998100827@s.whatsapp.net'),
    ).toBe('38998100827');
    expect(
      resolveInboundSender('53455246884964@lid', '5538998100827:2@s.whatsapp.net'),
    ).toBe('38998100827');
  });

  it('expõe qrCode só para provedor de sessão QR', () => {
    const qr = 'data:image/png;base64,AAA';
    expect(clientQrCode('BAILEYS', qr)).toBe(qr);
    expect(clientQrCode('MOCK', qr)).toBeNull();
    expect(clientQrCode('LEGACY_MANUAL', qr)).toBeNull();
  });
});
