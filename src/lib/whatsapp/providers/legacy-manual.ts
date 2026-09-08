import { GatewayNotCapableError, type WhatsAppGateway } from '@/lib/whatsapp/gateway';
import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
} from '@/lib/whatsapp/types';

/**
 * Provider legado: não dispara sessão. `POST /api/leads/:id/whatsapp` envia pelo
 * gateway se houver conta CONNECTED; senão devolve wa.me. Campanha recusa este provider.
 */
export class LegacyManualGateway implements WhatsAppGateway {
  async connect(): Promise<{ state: 'disconnected'; qrCode: null }> {
    return { state: 'disconnected', qrCode: null };
  }

  async disconnect(): Promise<void> {
    return;
  }

  async status(): Promise<WhatsAppConnectionStatus> {
    return {
      state: 'disconnected',
      lastHeartbeatAt: null,
      detail: 'Envio manual via wa.me. Sem sessão automática.',
    };
  }

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    if (input.mediaId) {
      throw new GatewayNotCapableError(
        'wa.me não envia foto, vídeo ou áudio. Conecte o WhatsApp Web (QR).',
      );
    }
    throw new GatewayNotCapableError(
      'A conta manual (wa.me) não dispara campanha. Escolha Evolution, Chatwoot ou Simulado.',
    );
  }
}
