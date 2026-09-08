import { WhatsAppProvider, type WhatsAppSessionStatus } from '@prisma/client';
import { z } from 'zod';

import {
  assertStaff,
  canManageWhatsAppAccounts,
  ForbiddenError,
  type SessionUser,
} from '@/lib/auth/rbac';
import { clientQrCode, isWhatsAppQrProvider, WHATSAPP_WORKER_SETUP } from '@/constants/whatsapp';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { getRedis } from '@/lib/redis';
import { createWhatsAppGateway } from '@/lib/whatsapp';
import type { WhatsAppConnectResult } from '@/lib/whatsapp/gateway';
import { GatewayNotCapableError } from '@/lib/whatsapp/gateway';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import {
  countActiveCampaignsForAccount,
  countQueuedRecipientsForAccount,
  createWhatsAppAccount,
  findWhatsAppAccount,
  listWhatsAppAccounts,
  updateWhatsAppAccount,
} from '@/server/repositories/whatsapp.repository';
import { recordAudit } from '@/server/services/audit.service';

export const createWhatsAppAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(32).optional(),
  provider: z.literal(WhatsAppProvider.BAILEYS).optional().default(WhatsAppProvider.BAILEYS),
});

function sessionFromConnectState(state: WhatsAppConnectResult['state']): WhatsAppSessionStatus {
  if (state === 'connected') return 'CONNECTED';
  if (state === 'qr_code') return 'QR_CODE';
  if (state === 'connecting') return 'CONNECTING';
  if (state === 'failed') return 'FAILED';
  return 'DISCONNECTED';
}

function serialize(
  row: Awaited<ReturnType<typeof listWhatsAppAccounts>>[number],
  extras: { activeCampaigns: number; queued: number },
) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    provider: row.provider,
    status: row.status,
    sessionStatus: row.sessionStatus,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    providerInboxId: row.providerInboxId,
    providerInstanceName: row.providerInstanceName,
    qrCode: clientQrCode(row.provider, row.qrCode),
    workerReady: (() => {
      const redis = getRedis();
      if (!redis) return false;
      return redis.status !== 'end' && redis.status !== 'close';
    })(),
    activeCampaigns: extras.activeCampaigns,
    queued: extras.queued,
    createdAt: row.createdAt.toISOString(),
  };
}

async function serializeAccount(id: string) {
  const row = await findWhatsAppAccount(id);
  if (!row) throw new NotFoundError('Conta WhatsApp não encontrada.');
  return serialize(row, {
    activeCampaigns: await countActiveCampaignsForAccount(id),
    queued: await countQueuedRecipientsForAccount(id),
  });
}

export async function getWhatsAppAccounts(user: SessionUser) {
  assertStaff(user);
  const rows = await listWhatsAppAccounts();
  return Promise.all(
    rows.map(async (row) =>
      serialize(row, {
        activeCampaigns: await countActiveCampaignsForAccount(row.id),
        queued: await countQueuedRecipientsForAccount(row.id),
      }),
    ),
  );
}

export async function addWhatsAppAccount(
  user: SessionUser,
  input: z.infer<typeof createWhatsAppAccountSchema>,
) {
  if (!canManageWhatsAppAccounts(user)) {
    throw new ForbiddenError('Somente administrador adiciona conta WhatsApp.');
  }
  if (input.provider === 'BAILEYS' && !process.env.REDIS_URL) {
    throw new BadRequestError(
      `REDIS_URL ausente. ${WHATSAPP_WORKER_SETUP}`,
    );
  }

  const row = await createWhatsAppAccount({
    name: input.name,
    phone: input.phone,
    provider: 'BAILEYS',
  });

  await recordAudit({
    userId: user.id,
    action: 'whatsapp.account.create',
    entity: 'WhatsAppAccount',
    entityId: row.id,
    changes: { provider: input.provider, name: input.name },
  });
  await notifyChange({ type: 'whatsapp.create', tags: MUTATION_TAGS.whatsapp, entityId: row.id });
  return serialize(row, { activeCampaigns: 0, queued: 0 });
}

function gatewayFor(account: NonNullable<Awaited<ReturnType<typeof findWhatsAppAccount>>>) {
  return createWhatsAppGateway(account, {
    readStoredQr: async () => {
      const fresh = await findWhatsAppAccount(account.id);
      return fresh?.qrCode ?? null;
    },
  });
}

export async function connectWhatsAppAccount(user: SessionUser, id: string) {
  if (!canManageWhatsAppAccounts(user) && user.role !== 'MANAGER') {
    throw new ForbiddenError('Sem permissão para reconectar conta.');
  }
  const account = await findWhatsAppAccount(id);
  if (!account) throw new NotFoundError('Conta WhatsApp não encontrada.');

  await updateWhatsAppAccount(id, {
    sessionStatus: 'CONNECTING',
    qrCode: isWhatsAppQrProvider(account.provider) ? account.qrCode : null,
  });

  try {
    const gateway = gatewayFor(account);
    const result = (await gateway.connect()) ?? { state: 'disconnected' as const, qrCode: null };
    const fresh = await findWhatsAppAccount(id);
    if (fresh?.sessionStatus === 'CONNECTED') {
      await recordAudit({
        userId: user.id,
        action: 'whatsapp.connect',
        entity: 'WhatsAppAccount',
        entityId: id,
        changes: { sessionStatus: 'CONNECTED', hasQr: false },
      });
      await notifyChange({ type: 'whatsapp.connect', tags: MUTATION_TAGS.whatsapp, entityId: id });
      return serialize(fresh, {
        activeCampaigns: await countActiveCampaignsForAccount(id),
        queued: await countQueuedRecipientsForAccount(id),
      });
    }
    const sessionStatus = sessionFromConnectState(result.state);
    const updated = await updateWhatsAppAccount(id, {
      sessionStatus,
      status: sessionStatus === 'CONNECTED' ? 'ACTIVE' : account.status,
      qrCode: result.qrCode ?? (sessionStatus === 'CONNECTED' ? null : undefined),
      lastHeartbeatAt: new Date(),
      lastConnectedAt: sessionStatus === 'CONNECTED' ? new Date() : undefined,
      providerInstanceName: account.providerInstanceName,
    });
    await recordAudit({
      userId: user.id,
      action: 'whatsapp.connect',
      entity: 'WhatsAppAccount',
      entityId: id,
      changes: { sessionStatus, hasQr: Boolean(result.qrCode) },
    });
    await notifyChange({ type: 'whatsapp.connect', tags: MUTATION_TAGS.whatsapp, entityId: id });
    return serialize(updated, {
      activeCampaigns: await countActiveCampaignsForAccount(id),
      queued: await countQueuedRecipientsForAccount(id),
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    if (error instanceof GatewayNotCapableError) {
      if (account.provider !== 'BAILEYS') {
        await updateWhatsAppAccount(id, {
          sessionStatus: 'FAILED',
          status: 'ERROR',
        });
      }
      throw new BadRequestError(error.message);
    }
    await updateWhatsAppAccount(id, {
      sessionStatus: 'FAILED',
      status: 'ERROR',
    });
    throw error;
  }
}

/** Atualiza o QR sem recriar a conta (Baileys no worker). */
export async function refreshWhatsAppQr(user: SessionUser, id: string) {
  return connectWhatsAppAccount(user, id);
}

export async function disconnectWhatsAppAccount(user: SessionUser, id: string) {
  if (!canManageWhatsAppAccounts(user) && user.role !== 'MANAGER') {
    throw new ForbiddenError('Sem permissão para desconectar conta.');
  }
  const account = await findWhatsAppAccount(id);
  if (!account) throw new NotFoundError('Conta WhatsApp não encontrada.');
  const gateway = gatewayFor(account);
  await gateway.disconnect();
  const updated = await updateWhatsAppAccount(id, {
    sessionStatus: 'DISCONNECTED',
    status: 'INACTIVE',
    qrCode: null,
  });
  await recordAudit({
    userId: user.id,
    action: 'whatsapp.disconnect',
    entity: 'WhatsAppAccount',
    entityId: id,
  });
  await notifyChange({ type: 'whatsapp.disconnect', tags: MUTATION_TAGS.whatsapp, entityId: id });
  return serialize(updated, {
    activeCampaigns: await countActiveCampaignsForAccount(id),
    queued: await countQueuedRecipientsForAccount(id),
  });
}

export { serializeAccount };
