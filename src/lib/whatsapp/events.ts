import type { WhatsAppGateway } from '@/lib/whatsapp/gateway';
import type {
  InboundWhatsAppMessage,
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
  WhatsAppStatusUpdate,
} from '@/lib/whatsapp/types';

export type WhatsAppInboundHandler = (event: InboundWhatsAppMessage) => Promise<void>;
export type WhatsAppStatusHandler = (event: WhatsAppStatusUpdate) => Promise<void>;

export interface WhatsAppEventBus {
  onInbound(handler: WhatsAppInboundHandler): void;
  onStatus(handler: WhatsAppStatusHandler): void;
}

/** Eventos do gateway. O worker persiste; o provider só emite. */
export function createInMemoryEventBus(): WhatsAppEventBus & {
  emitInbound: WhatsAppInboundHandler;
  emitStatus: WhatsAppStatusHandler;
} {
  const inbound: WhatsAppInboundHandler[] = [];
  const status: WhatsAppStatusHandler[] = [];
  return {
    onInbound(handler) {
      inbound.push(handler);
    },
    onStatus(handler) {
      status.push(handler);
    },
    async emitInbound(event) {
      for (const handler of inbound) await handler(event);
    },
    async emitStatus(event) {
      for (const handler of status) await handler(event);
    },
  };
}

export type { WhatsAppGateway };
export type {
  InboundWhatsAppMessage,
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppConnectionStatus,
  WhatsAppStatusUpdate,
};
