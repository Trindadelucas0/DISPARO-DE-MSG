export const QUEUE_NAMES = {
  campaignSend: 'campaign-send',
  campaignRetry: 'campaign-retry',
  whatsappInbound: 'whatsapp-inbound',
  whatsappStatus: 'whatsapp-status',
  conversationRouting: 'conversation-routing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type CampaignSendKind = 'initial' | 'followup';

export interface CampaignSendJob {
  readonly campaignId: string;
  readonly leadId: string;
  readonly recipientId: string;
  readonly idempotencyKey: string;
  readonly kind?: CampaignSendKind;
}

export interface WhatsappInboundJob {
  readonly accountId: string;
  readonly from: string;
  readonly body: string;
  readonly providerMessageId: string;
  readonly receivedAt: string;
  readonly mediaId?: string;
  readonly kind?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO';
}

export interface WhatsappStatusJob {
  readonly providerMessageId: string;
  readonly status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  readonly error?: string;
}

export interface ConversationRoutingJob {
  readonly conversationId: string;
  readonly campaignId?: string | null;
}
