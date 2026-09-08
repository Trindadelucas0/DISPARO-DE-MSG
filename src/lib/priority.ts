/**
 * Fila do dia: atrasado → hoje → lead novo → futuro.
 * Função pura para o serviço e para o teste de unidade.
 */

export type ContactBucket = 'overdue' | 'today' | 'new' | 'future';

export interface RankableLead {
  readonly lastContactAt: Date | string | null;
  readonly nextContactAt: Date | string | null;
  readonly createdAt: Date | string;
}

function asDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function contactBucket(lead: RankableLead, now: Date = new Date()): ContactBucket {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const next = asDate(lead.nextContactAt);
  if (next && next < start) return 'overdue';
  if (next && next >= start && next <= end) return 'today';
  if (!lead.lastContactAt && !next) return 'new';
  if (next && next > end) return 'future';
  if (!next && lead.lastContactAt) return 'future';
  return 'new';
}

const BUCKET_ORDER: Readonly<Record<ContactBucket, number>> = {
  overdue: 0,
  today: 1,
  new: 2,
  future: 3,
};

export function compareContactPriority(a: RankableLead, b: RankableLead, now: Date = new Date()): number {
  const bucketDiff = BUCKET_ORDER[contactBucket(a, now)] - BUCKET_ORDER[contactBucket(b, now)];
  if (bucketDiff !== 0) return bucketDiff;

  const nextA = asDate(a.nextContactAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const nextB = asDate(b.nextContactAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (nextA !== nextB) return nextA - nextB;

  const createdA = asDate(a.createdAt)?.getTime() ?? 0;
  const createdB = asDate(b.createdAt)?.getTime() ?? 0;
  return createdA - createdB;
}
