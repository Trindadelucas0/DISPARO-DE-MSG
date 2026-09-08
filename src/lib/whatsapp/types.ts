export type WhatsAppConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_code'
  | 'connected'
  | 'failed';

export interface WhatsAppConnectionStatus {
  readonly state: WhatsAppConnectionState;
  readonly lastHeartbeatAt: string | null;
  readonly detail: string | null;
}

export interface SendWhatsAppMessageInput {
  readonly accountId: string;
  readonly to: string;
  readonly body: string;
  readonly mediaId?: string;
  readonly idempotencyKey: string;
  readonly conversationId?: string;
  readonly campaignId?: string;
  readonly leadId?: string;
}

export interface SendWhatsAppMessageResult {
  readonly providerMessageId: string;
  readonly accepted: boolean;
}

export interface InboundWhatsAppMessage {
  readonly accountId: string;
  readonly from: string;
  readonly body: string;
  readonly providerMessageId: string;
  readonly receivedAt: string;
}

export interface WhatsAppStatusUpdate {
  readonly providerMessageId: string;
  readonly status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  readonly error?: string;
}
