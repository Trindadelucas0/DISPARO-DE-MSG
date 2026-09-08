import { prisma } from '@/lib/db';
import type { Prisma, WhatsAppProvider } from '@prisma/client';

export async function listWhatsAppAccounts() {
  return prisma.whatsAppAccount.findMany({
    where: { provider: 'BAILEYS' },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findWhatsAppAccount(id: string) {
  return prisma.whatsAppAccount.findUnique({ where: { id } });
}

/** Conta WhatsApp Web (QR) CONNECTED mais recente (envio pelo gateway). */
export async function findSendableConnectedAccount() {
  return prisma.whatsAppAccount.findFirst({
    where: {
      provider: 'BAILEYS',
      sessionStatus: 'CONNECTED',
    },
    orderBy: [{ lastHeartbeatAt: 'desc' }, { lastConnectedAt: 'desc' }],
  });
}

export async function findWhatsAppAccountByInstanceName(instanceName: string) {
  return prisma.whatsAppAccount.findFirst({
    where: { providerInstanceName: instanceName, provider: 'EVOLUTION' },
  });
}

export async function createWhatsAppAccount(data: {
  name: string;
  phone?: string | null;
  provider: WhatsAppProvider;
  providerInboxId?: string | null;
  providerInstanceName?: string | null;
}) {
  const instanceName =
    data.provider === 'EVOLUTION'
      ? data.providerInstanceName?.trim() ||
        `crm-${data.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 24)}-${Date.now().toString(36)}`
      : data.providerInstanceName ?? null;

  return prisma.whatsAppAccount.create({
    data: {
      name: data.name,
      phone: data.phone ?? null,
      provider: data.provider,
      providerInboxId: data.providerInboxId ?? null,
      providerInstanceName: instanceName,
      status: data.provider === 'MOCK' ? 'ACTIVE' : 'INACTIVE',
      sessionStatus: data.provider === 'MOCK' ? 'CONNECTED' : 'DISCONNECTED',
      lastHeartbeatAt: data.provider === 'MOCK' ? new Date() : null,
    },
  });
}

export async function updateWhatsAppAccount(id: string, data: Prisma.WhatsAppAccountUpdateInput) {
  return prisma.whatsAppAccount.update({ where: { id }, data });
}

export async function countActiveCampaignsForAccount(accountId: string) {
  return prisma.campaign.count({
    where: { whatsappAccountId: accountId, status: { in: ['RUNNING', 'PAUSED'] } },
  });
}

export async function countQueuedRecipientsForAccount(accountId: string) {
  return prisma.campaignRecipient.count({
    where: {
      status: { in: ['PENDING', 'QUEUED'] },
      campaign: { whatsappAccountId: accountId, status: 'RUNNING' },
    },
  });
}
