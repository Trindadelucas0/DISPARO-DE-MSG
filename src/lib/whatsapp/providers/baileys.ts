import { WHATSAPP_WORKER_SETUP } from '@/constants/whatsapp';
import {
  GatewayNotCapableError,
  type WhatsAppConnectResult,
  type WhatsAppGateway,
} from '@/lib/whatsapp/gateway';
import { publishWhatsAppSessionCommand, requestWhatsAppSend } from '@/lib/whatsapp/session-bus';
import { findWhatsAppAccount } from '@/server/repositories/whatsapp.repository';
import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
} from '@/lib/whatsapp/types';

/**
 * Gateway Baileys: o Next só publica comando. O worker gera o QR e a sessão.
 */
export class BaileysGateway implements WhatsAppGateway {
  constructor(private readonly accountId: string) {}

  async connect(): Promise<WhatsAppConnectResult> {
    await publishWhatsAppSessionCommand({ action: 'connect', accountId: this.accountId });

    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const row = await findWhatsAppAccount(this.accountId);
      if (!row) throw new GatewayNotCapableError('Conta WhatsApp não encontrada.');
      if (row.sessionStatus === 'FAILED') {
        throw new GatewayNotCapableError('Falha ao abrir sessão WhatsApp. Tente Conectar de novo.');
      }
      if (row.sessionStatus === 'CONNECTED') {
        return { state: 'connected', qrCode: null, detail: 'Sessão conectada.' };
      }
      if (row.qrCode && (row.sessionStatus === 'QR_CODE' || row.sessionStatus === 'CONNECTING')) {
        return { state: 'qr_code', qrCode: row.qrCode, detail: 'Escaneie o QR no WhatsApp.' };
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    throw new GatewayNotCapableError(
      `Nenhum QR chegou. ${WHATSAPP_WORKER_SETUP} Tente Conectar de novo.`,
    );
  }

  async disconnect(): Promise<void> {
    await publishWhatsAppSessionCommand({ action: 'disconnect', accountId: this.accountId });
  }

  async status(): Promise<WhatsAppConnectionStatus> {
    const row = await findWhatsAppAccount(this.accountId);
    if (!row) {
      return { state: 'disconnected', lastHeartbeatAt: null, detail: 'Conta inexistente.' };
    }
    const map = {
      CONNECTED: 'connected',
      CONNECTING: 'connecting',
      QR_CODE: 'qr_code',
      FAILED: 'failed',
      DISCONNECTED: 'disconnected',
    } as const;
    return {
      state: map[row.sessionStatus],
      lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
      detail: row.sessionStatus === 'QR_CODE' ? 'Aguardando leitura do QR.' : null,
    };
  }

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    const reply = await requestWhatsAppSend({
      accountId: input.accountId,
      to: input.to,
      body: input.body,
      mediaId: input.mediaId,
    });
    if (!reply.ok) {
      throw new GatewayNotCapableError(reply.error);
    }
    return { providerMessageId: reply.providerMessageId, accepted: true };
  }
}
