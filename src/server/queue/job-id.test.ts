import { describe, expect, it } from 'vitest';

import { followUpIdempotencyKey, recipientIdempotencyKey } from '@/server/queue/campaign-helpers';
import { isBullDuplicateJobError, isCampaignJobId, toBullJobId } from '@/server/queue/job-id';

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

describe('isCampaignJobId', () => {
  const campanha = 'cmvs1m42s02fpkykvty7bqa2c';
  const lead = 'cmtsshc4902kxkyiej73czzrg';

  it('pega primeira onda, retorno e retry da campanha', () => {
    expect(isCampaignJobId(`${campanha}-${lead}`, campanha)).toBe(true);
    expect(isCampaignJobId(`followup-${campanha}-${lead}`, campanha)).toBe(true);
    expect(isCampaignJobId(`retry-${campanha}-${lead}`, campanha)).toBe(true);
    expect(isCampaignJobId(`retry-followup-${campanha}-${lead}-r9`, campanha)).toBe(true);
  });

  it('pega chave reenfileirada à mão (sufixo -r1)', () => {
    expect(isCampaignJobId(`${campanha}-${lead}-r1`, campanha)).toBe(true);
  });

  it('não pega job de outra campanha nem de outra fila', () => {
    expect(isCampaignJobId(`cmvs1diya0001kykv31j1yry9-${lead}`, campanha)).toBe(false);
    expect(isCampaignJobId(`route-${lead}-123`, campanha)).toBe(false);
    expect(isCampaignJobId(campanha, campanha)).toBe(false);
  });
});
