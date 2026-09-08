import type { InteractionResult, LeadStatus } from '@prisma/client';

import { contactBucket, type ContactBucket } from '@/lib/priority';
import { CACHE_TAGS, CACHE_TTL, cacheKey, getOrSet } from '@/lib/cache';
import { assertStaff, leadScopeWhere, type SessionUser } from '@/lib/auth/rbac';
import { findLeadsForContactQueue } from '@/server/repositories/follow-up.repository';

export interface ContactQueueItem {
  readonly id: string;
  readonly razaoSocial: string;
  readonly nomeFantasia: string | null;
  readonly cidade: string | null;
  readonly estado: string | null;
  readonly whatsapp: string | null;
  readonly telefone: string | null;
  readonly email: string | null;
  readonly status: LeadStatus;
  readonly lastContactAt: string | null;
  readonly nextContactAt: string | null;
  readonly lastInteractionResult: InteractionResult | null;
  readonly lastInteractionAt: string | null;
  readonly createdAt: string;
  readonly bucket: ContactBucket;
}

export interface ContactQueue {
  readonly items: readonly ContactQueueItem[];
  readonly counts: Record<ContactBucket, number>;
  readonly nextOffset: number | null;
}

export async function getContactsToday(
  user: SessionUser,
  options: { bucket?: ContactBucket | 'all'; offset?: number; limit?: number } = {},
): Promise<ContactQueue> {
  assertStaff(user);
  const bucket = options.bucket ?? 'all';
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  const key = cacheKey('contacts:today', `${user.role}:${user.id}:${bucket}:${offset}:${limit}`);

  return getOrSet(
    key,
    CACHE_TTL.leadList,
    async () => {
      const { items, counts, nextOffset } = await findLeadsForContactQueue(leadScopeWhere(user), {
        bucket,
        offset,
        limit,
      });
      const now = new Date();

      return {
        items: items.map((row) => ({
          id: row.id,
          razaoSocial: row.razaoSocial,
          nomeFantasia: row.nomeFantasia,
          cidade: row.cidade,
          estado: row.estado,
          whatsapp: row.whatsapp,
          telefone: row.telefone,
          email: row.email,
          status: row.status,
          lastContactAt: row.lastContactAt?.toISOString() ?? null,
          nextContactAt: row.nextContactAt?.toISOString() ?? null,
          lastInteractionResult: row.lastInteractionResult,
          lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          bucket: contactBucket(row, now),
        })),
        counts,
        nextOffset,
      };
    },
    { tags: [CACHE_TAGS.contacts, CACHE_TAGS.leads, CACHE_TAGS.followUps] },
  );
}
