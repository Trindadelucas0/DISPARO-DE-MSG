import { GatewayNotCapableError, type WhatsAppGateway } from '@/lib/whatsapp/gateway';
import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
} from '@/lib/whatsapp/types';

function chatwootConfig() {
  const baseUrl = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
  const token = process.env.CHATWOOT_API_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  return { baseUrl, token, accountId };
}

/**
 * Chatwoot como gateway de WhatsApp Web. O CRM persiste Conversation/Message.
 * Segredos ficam só em env. Sem configuração, o status é honesto (desconectado).
 */
export class ChatwootGateway implements WhatsAppGateway {
  constructor(private readonly inboxId: string | null) {}

  async connect(): Promise<{ state: 'connected' | 'disconnected' | 'failed'; qrCode: null }> {
    const status = await this.status();
    if (status.state !== 'connected') {
      throw new GatewayNotCapableError(status.detail ?? 'Chatwoot não está configurado.');
    }
    return { state: 'connected', qrCode: null };
  }

  async disconnect(): Promise<void> {
    return;
  }

  async status(): Promise<WhatsAppConnectionStatus> {
    const { baseUrl, token, accountId } = chatwootConfig();
    if (!baseUrl || !token || !accountId) {
      return {
        state: 'disconnected',
        lastHeartbeatAt: null,
        detail: 'CHATWOOT_BASE_URL, CHATWOOT_API_TOKEN e CHATWOOT_ACCOUNT_ID não estão definidos.',
      };
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/inboxes`, {
        headers: { api_access_token: token, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        return {
          state: 'failed',
          lastHeartbeatAt: null,
          detail: `Chatwoot respondeu ${response.status}.`,
        };
      }
      return {
        state: 'connected',
        lastHeartbeatAt: new Date().toISOString(),
        detail: this.inboxId ? `Inbox ${this.inboxId}` : 'API Chatwoot acessível.',
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
    const { baseUrl, token, accountId } = chatwootConfig();
    if (!baseUrl || !token || !accountId) {
      throw new GatewayNotCapableError('Chatwoot não está configurado neste ambiente.');
    }
    if (!this.inboxId) {
      throw new GatewayNotCapableError('A conta não tem providerInboxId do Chatwoot.');
    }

    const response = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/conversations/${encodeURIComponent(input.conversationId ?? '0')}/messages`,
      {
        method: 'POST',
        headers: {
          api_access_token: token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          content: input.body,
          message_type: 'outgoing',
          private: false,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Chatwoot recusou o envio (${response.status}): ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { id?: number | string };
    return {
      providerMessageId: String(payload.id ?? `cw:${input.idempotencyKey}`),
      accepted: true,
    };
  }
}
