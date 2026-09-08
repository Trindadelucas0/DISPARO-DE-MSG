export const WHATSAPP_SESSION_CHANNEL = 'crm:whatsapp:session';

export type WhatsAppSessionCommand =
  | { readonly action: 'connect'; readonly accountId: string }
  | { readonly action: 'disconnect'; readonly accountId: string }
  | {
      readonly action: 'send';
      readonly accountId: string;
      readonly to: string;
      readonly body: string;
      readonly requestId: string;
      readonly mediaId?: string;
    }
  | {
      readonly action: 'list-contacts';
      readonly accountId: string;
      readonly requestId: string;
    };

export function sendReplyKey(requestId: string): string {
  return `crm:whatsapp:send:${requestId}`;
}

export function contactsReplyKey(requestId: string): string {
  return `crm:whatsapp:contacts:${requestId}`;
}

export type WhatsAppSendReply =
  | { readonly ok: true; readonly providerMessageId: string }
  | { readonly ok: false; readonly error: string };

export type WhatsAppImportedContactDto = {
  readonly phone: string;
  readonly name: string;
};

export type WhatsAppContactsReply =
  | {
      readonly ok: true;
      readonly contacts: readonly WhatsAppImportedContactDto[];
      readonly skipped: number;
    }
  | { readonly ok: false; readonly error: string };
