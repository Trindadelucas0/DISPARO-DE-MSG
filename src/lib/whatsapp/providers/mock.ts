import { randomUUID } from 'node:crypto';

import type { WhatsAppGateway } from '@/lib/whatsapp/gateway';
import { createInMemoryEventBus } from '@/lib/whatsapp/events';
import type {
  InboundWhatsAppMessage,
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
} from '@/lib/whatsapp/types';

export class MockWhatsAppGateway implements WhatsAppGateway {
  readonly sent: SendWhatsAppMessageInput[] = [];
  readonly bus = createInMemoryEventBus();
  private connected = true;

  async connect(): Promise<{ state: 'connected'; qrCode: null }> {
    this.connected = true;
    return { state: 'connected', qrCode: null };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async status(): Promise<WhatsAppConnectionStatus> {
    return {
      state: this.connected ? 'connected' : 'disconnected',
      lastHeartbeatAt: this.connected ? new Date().toISOString() : null,
      detail: this.connected ? 'Gateway simulado conectado.' : 'Gateway simulado desligado.',
    };
  }

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    if (!this.connected) {
      throw new Error('Gateway simulado desconectado.');
    }
    const existing = this.sent.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return { providerMessageId: `mock:${existing.idempotencyKey}`, accepted: true };
    }
    this.sent.push(input);
    return { providerMessageId: `mock:${input.idempotencyKey}`, accepted: true };
  }

  async simulateInbound(partial: Omit<InboundWhatsAppMessage, 'receivedAt' | 'accountId'> & {
    accountId?: string;
  }): Promise<void> {
    await this.bus.emitInbound({
      accountId: partial.accountId ?? 'mock-account',
      from: partial.from,
      body: partial.body,
      providerMessageId: partial.providerMessageId ?? randomUUID(),
      receivedAt: new Date().toISOString(),
    });
  }
}
