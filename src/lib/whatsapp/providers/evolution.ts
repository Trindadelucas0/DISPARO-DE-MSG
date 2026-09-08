import {
  GatewayNotCapableError,
  type WhatsAppConnectResult,
  type WhatsAppGateway,
} from '@/lib/whatsapp/gateway';
import {
  connectUntilQr,
  getEvolutionConnectionState,
  logoutEvolutionInstance,
  sendEvolutionText,
} from '@/lib/evolution/client';
import { getEvolutionConfig } from '@/lib/evolution/config';
import {
  extractConnectionState,
  mapEvolutionStateToSession,
  resolveQrImage,
} from '@/lib/evolution/qr';
import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
} from '@/lib/whatsapp/types';

/**
 * Evolution API (WhatsApp Web / Baileys) — mesmo padrão do Chamado.
 * O CRM persiste QR e sessão; Evolution é só o canal.
 */
export class EvolutionGateway implements WhatsAppGateway {
  constructor(
    private readonly instanceName: string,
    private readonly readStoredQr?: () => Promise<string | null>,
  ) {}

  async connect(): Promise<WhatsAppConnectResult> {
    if (!getEvolutionConfig()) {
      throw new GatewayNotCapableError(
        'Evolution não configurada. Defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_SECRET.',
      );
    }
    if (!this.instanceName.trim()) {
      throw new GatewayNotCapableError('Conta sem nome de instância Evolution.');
    }

    const { qr, payload } = await connectUntilQr(this.instanceName, {
      resolveQr: (p) => resolveQrImage(p),
      readStoredQr: this.readStoredQr,
      extractState: extractConnectionState,
    });

    const mapped = mapEvolutionStateToSession(extractConnectionState(payload));
    if (mapped === 'CONNECTED') {
      return { state: 'connected', qrCode: null, detail: 'Sessão já conectada.' };
    }
    if (qr) {
      return { state: 'qr_code', qrCode: qr, detail: 'Escaneie o QR no WhatsApp.' };
    }
    return { state: 'connecting', qrCode: null, detail: 'Aguardando QR da Evolution.' };
  }

  async disconnect(): Promise<void> {
    if (!getEvolutionConfig()) return;
    try {
      await logoutEvolutionInstance(this.instanceName);
    } catch {
      /* instância pode já estar fora */
    }
  }

  async status(): Promise<WhatsAppConnectionStatus> {
    if (!getEvolutionConfig()) {
      return {
        state: 'disconnected',
        lastHeartbeatAt: null,
        detail: 'EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_WEBHOOK_SECRET ausentes.',
      };
    }
    try {
      const payload = await getEvolutionConnectionState(this.instanceName);
      const mapped = mapEvolutionStateToSession(extractConnectionState(payload));
      const state =
        mapped === 'CONNECTED'
          ? 'connected'
          : mapped === 'QR_CODE'
            ? 'qr_code'
            : mapped === 'FAILED'
              ? 'failed'
              : mapped === 'DISCONNECTED'
                ? 'disconnected'
                : 'connecting';
      return {
        state,
        lastHeartbeatAt: new Date().toISOString(),
        detail: `Instância ${this.instanceName}`,
      };
    } catch (error) {
      return {
        state: 'failed',
        lastHeartbeatAt: null,
        detail: (error as Error).message,
      };
    }
  }

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    if (input.mediaId) {
      throw new GatewayNotCapableError(
        'Esta conta não envia foto, vídeo ou áudio. Use WhatsApp Web (QR).',
      );
    }
    if (!getEvolutionConfig()) {
      throw new GatewayNotCapableError('Evolution não configurada neste ambiente.');
    }
    const number = input.to.replace(/\D/g, '');
    const result = await sendEvolutionText(this.instanceName, number, input.body);
    const id =
      (typeof result.key === 'object' &&
        result.key &&
        typeof (result.key as { id?: string }).id === 'string' &&
        (result.key as { id: string }).id) ||
      (typeof result.messageId === 'string' && result.messageId) ||
      `evo:${input.idempotencyKey}`;
    return { providerMessageId: String(id), accepted: true };
  }
}
