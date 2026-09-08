import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
} from '@/lib/whatsapp/types';

export interface WhatsAppConnectResult {
  readonly state: WhatsAppConnectionStatus['state'];
  readonly qrCode?: string | null;
  readonly detail?: string | null;
}

export interface WhatsAppGateway {
  connect(): Promise<WhatsAppConnectResult | void>;
  disconnect(): Promise<void>;
  status(): Promise<WhatsAppConnectionStatus>;
  sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult>;
}

export class GatewayNotCapableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayNotCapableError';
  }
}
