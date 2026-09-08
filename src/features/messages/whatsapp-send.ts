export type LeadWhatsappSendResponse =
  | {
      mode: 'connected';
      conversationId: string;
      interaction: { id: string; result: string | null };
    }
  | {
      mode: 'manual';
      whatsappUrl: string;
      interaction: { id: string; result: string | null };
    };
