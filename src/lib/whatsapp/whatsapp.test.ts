import { describe, expect, it } from 'vitest';

import { isConnectedSendableAccount } from '@/constants/whatsapp';
import { MockWhatsAppGateway } from '@/lib/whatsapp/providers/mock';
import { LegacyManualGateway } from '@/lib/whatsapp/providers/legacy-manual';
import { recipientIdempotencyKey, takeRecipientLimit } from '@/server/queue/campaign-helpers';
import { buildLeadTemplateVars } from '@/server/queue/campaign-helpers';
import { renderTemplate } from '@/lib/template';

describe('whatsapp gateway + campaign helpers', () => {
  it('MockWhatsAppGateway é idempotente por chave', async () => {
    const gateway = new MockWhatsAppGateway();
    const input = {
      accountId: 'acc',
      to: '5511999999999',
      body: 'oi',
      idempotencyKey: 'c1:l1',
    };
    const first = await gateway.sendMessage(input);
    const second = await gateway.sendMessage(input);
    expect(first.providerMessageId).toBe(second.providerMessageId);
    expect(gateway.sent).toHaveLength(1);
  });

  it('LegacyManual recusa sendMessage de campanha', async () => {
    const gateway = new LegacyManualGateway();
    await expect(
      gateway.sendMessage({
        accountId: 'acc',
        to: '5511999999999',
        body: 'oi',
        idempotencyKey: 'x',
      }),
    ).rejects.toThrow(/wa\.me/);
  });

  it('LegacyManual recusa mídia', async () => {
    const gateway = new LegacyManualGateway();
    await expect(
      gateway.sendMessage({
        accountId: 'acc',
        to: '5511999999999',
        body: 'foto',
        mediaId: 'media-1',
        idempotencyKey: 'x-media',
      }),
    ).rejects.toThrow(/foto, vídeo ou áudio/);
  });

  it('idempotencyKey une campaignId e leadId sem dois-pontos', () => {
    expect(recipientIdempotencyKey('c', 'l')).toBe('c-l');
  });

  it('takeRecipientLimit corta os primeiros N e ignora limite inválido', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(takeRecipientLimit(rows, 2)).toEqual([1, 2]);
    expect(takeRecipientLimit(rows, null)).toEqual(rows);
    expect(takeRecipientLimit(rows, 0)).toEqual(rows);
    expect(takeRecipientLimit(rows, 99)).toEqual(rows);
  });

  it('isConnectedSendableAccount recusa manual e desconectada', () => {
    expect(
      isConnectedSendableAccount({ provider: 'BAILEYS', sessionStatus: 'CONNECTED' }),
    ).toBe(true);
    expect(
      isConnectedSendableAccount({ provider: 'MOCK', sessionStatus: 'CONNECTED' }),
    ).toBe(false);
    expect(
      isConnectedSendableAccount({ provider: 'LEGACY_MANUAL', sessionStatus: 'CONNECTED' }),
    ).toBe(false);
    expect(
      isConnectedSendableAccount({ provider: 'BAILEYS', sessionStatus: 'DISCONNECTED' }),
    ).toBe(false);
  });

  it('renderiza variáveis novas do template', () => {
    const vars = buildLeadTemplateVars(
      {
        razaoSocial: 'Acme Locações LTDA',
        nomeFantasia: 'Acme',
        cidade: 'São Paulo',
        estado: 'SP',
        cnpj: '123',
        telefone: null,
        whatsapp: '11999999999',
        email: null,
        segmento: 'Eventos',
        porte: 'ME',
      },
      { vendedor: 'Ana', responsavel: 'Ana' },
    );
    const text = renderTemplate(
      'Oi {{primeiroNome}} da {{empresa}} em {{pais}} — {{segmento}}/{{porte}} ({{responsavel}})',
      vars,
    );
    expect(text).toContain('Acme');
    expect(text).toContain('Brasil');
    expect(text).toContain('Eventos');
  });
});

describe('domínio campanha → mock → inbound (sem Prisma)', () => {
  it('loop: envio mock + inbound emitido', async () => {
    const gateway = new MockWhatsAppGateway();
    const received: string[] = [];
    gateway.bus.onInbound(async (event) => {
      received.push(event.body);
    });

    await gateway.sendMessage({
      accountId: 'acc',
      to: '5511999999999',
      body: 'foto',
      mediaId: 'media-1',
      idempotencyKey: 'c-media',
    });
    expect(gateway.sent[0]?.mediaId).toBe('media-1');
    expect(gateway.sent).toHaveLength(1);

    await gateway.simulateInbound({
      accountId: 'mock',
      from: '5511987654321',
      body: 'Tenho interesse',
      providerMessageId: 'in-1',
    });
    expect(received).toEqual(['Tenho interesse']);
  });
});
