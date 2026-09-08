import type { WhatsAppAccount, WhatsAppProvider } from '@prisma/client';

import type { WhatsAppGateway } from '@/lib/whatsapp/gateway';
import { BaileysGateway } from '@/lib/whatsapp/providers/baileys';
import { ChatwootGateway } from '@/lib/whatsapp/providers/chatwoot';
import { EvolutionGateway } from '@/lib/whatsapp/providers/evolution';
import { LegacyManualGateway } from '@/lib/whatsapp/providers/legacy-manual';
import { MockWhatsAppGateway } from '@/lib/whatsapp/providers/mock';

const mockByAccount = new Map<string, MockWhatsAppGateway>();

export function getMockGateway(accountId: string): MockWhatsAppGateway {
  const existing = mockByAccount.get(accountId);
  if (existing) return existing;
  const created = new MockWhatsAppGateway();
  mockByAccount.set(accountId, created);
  return created;
}

export function createWhatsAppGateway(
  account: Pick<
    WhatsAppAccount,
    'id' | 'provider' | 'providerInboxId' | 'providerInstanceName'
  >,
  options?: { readStoredQr?: () => Promise<string | null> },
): WhatsAppGateway {
  return gatewayForProvider(account, options);
}

export function gatewayForProvider(
  account: Pick<
    WhatsAppAccount,
    'id' | 'provider' | 'providerInboxId' | 'providerInstanceName'
  >,
  options?: { readStoredQr?: () => Promise<string | null> },
): WhatsAppGateway {
  const provider: WhatsAppProvider = account.provider;
  if (provider === 'LEGACY_MANUAL') return new LegacyManualGateway();
  if (provider === 'CHATWOOT') return new ChatwootGateway(account.providerInboxId);
  if (provider === 'BAILEYS') return new BaileysGateway(account.id);
  if (provider === 'EVOLUTION') {
    const instanceName = account.providerInstanceName ?? `crm-${account.id.slice(0, 8)}`;
    return new EvolutionGateway(instanceName, options?.readStoredQr);
  }
  return getMockGateway(account.id);
}
