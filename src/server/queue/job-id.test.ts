import { describe, expect, it } from 'vitest';

import { followUpIdempotencyKey, recipientIdempotencyKey } from '@/server/queue/campaign-helpers';
import { isBullDuplicateJobError, toBullJobId } from '@/server/queue/job-id';

describe('toBullJobId', () => {
  it('remove dois-pontos que o BullMQ recusa', () => {
    expect(toBullJobId('cmt1:cmt2')).toBe('cmt1-cmt2');
    expect(toBullJobId('retry:cmt1-cmt2')).toBe('retry-cmt1-cmt2');
    expect(toBullJobId('true_55@c.us_ABC:SENT')).toBe('true_55@c.us_ABC-SENT');
  });

  it('chave nova e chave antiga sanitizada coincidem', () => {
    expect(recipientIdempotencyKey('c', 'l')).toBe('c-l');
    expect(toBullJobId('c:l')).toBe(recipientIdempotencyKey('c', 'l'));
  });

  it('chave de retorno não colide com a primeira onda', () => {
    expect(followUpIdempotencyKey('c', 'l')).toBe('followup-c-l');
    expect(followUpIdempotencyKey('c', 'l')).not.toBe(recipientIdempotencyKey('c', 'l'));
    expect(followUpIdempotencyKey('c', 'l', 9)).toBe('followup-c-l-r9');
    expect(toBullJobId(followUpIdempotencyKey('c', 'l'))).toBe('followup-c-l');
  });

  it('reconhece job duplicado do BullMQ', () => {
    expect(isBullDuplicateJobError(new Error('Job c-l already exists'))).toBe(true);
    expect(isBullDuplicateJobError(new Error('Custom Id cannot contain :'))).toBe(false);
  });
});
