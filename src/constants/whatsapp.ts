import type {
  WhatsAppAccountStatus,
  WhatsAppProvider,
  WhatsAppSessionStatus,
} from '@prisma/client';

export const WHATSAPP_PROVIDER_META: Readonly<
  Record<WhatsAppProvider, { readonly label: string; readonly description: string }>
> = {
  LEGACY_MANUAL: {
    label: 'Manual (wa.me)',
    description: 'Não dispara campanha nem envio pela Inbox. Use WhatsApp Web (QR).',
  },
  CHATWOOT: {
    label: 'Chatwoot',
    description: 'Gateway HTTP. O CRM continua a fonte da verdade.',
  },
  BAILEYS: {
    label: 'WhatsApp Web (QR)',
    description: 'QR gerado no worker do CRM. Escaneie no celular. Sem chave de API.',
  },
  EVOLUTION: {
    label: 'Evolution (legado)',
    description: 'Gateway HTTP externo. O QR padrão do CRM é WhatsApp Web (QR).',
  },
  MOCK: {
    label: 'Simulado',
    description: 'Para desenvolvimento e testes. Não sai mensagem real.',
  },
};

export function whatsappProviderLabel(provider: WhatsAppProvider): string {
  return WHATSAPP_PROVIDER_META[provider].label;
}

/** Redis + Baileys no Compose. Não rode `npm run worker` junto com o container. */
export const WHATSAPP_WORKER_SETUP =
  'Redis e o worker sobem juntos: docker compose up -d na pasta CRM. O Next não gera o QR sozinho.';

export const WHATSAPP_WORKER_MISSING =
  'Worker não respondeu. Confira se o container crm-worker está no ar (docker compose up -d na pasta CRM).';


export function isWhatsAppQrProvider(provider: WhatsAppProvider): boolean {
  return provider === 'BAILEYS' || provider === 'EVOLUTION';
}

/** Conta que dispara mensagem: só WhatsApp Web (QR) com sessão aberta. */
export function isConnectedSendableAccount(account: {
  readonly provider: WhatsAppProvider | string;
  readonly sessionStatus: WhatsAppSessionStatus | string;
}): boolean {
  return account.provider === 'BAILEYS' && account.sessionStatus === 'CONNECTED';
}

export function pickConnectedSendableAccount<
  T extends { readonly provider: string; readonly sessionStatus: string },
>(accounts: readonly T[]): T | undefined {
  return accounts.find(isConnectedSendableAccount);
}

export function clientQrCode(
  provider: WhatsAppProvider,
  qrCode: string | null,
): string | null {
  return isWhatsAppQrProvider(provider) ? qrCode : null;
}

export function whatsappAccountStatusLabel(status: WhatsAppAccountStatus): string {
  if (status === 'ACTIVE') return 'Ativa';
  if (status === 'INACTIVE') return 'Inativa';
  return 'Erro';
}

export function whatsappSessionStatusLabel(status: WhatsAppSessionStatus): string {
  if (status === 'CONNECTED') return 'Conectada';
  if (status === 'CONNECTING') return 'Conectando';
  if (status === 'QR_CODE') return 'Aguardando QR';
  if (status === 'FAILED') return 'Falhou';
  return 'Desconectada';
}
