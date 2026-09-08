import { describe, expect, it } from 'vitest';

import { outboundSendSuggestedStatus, suggestedStatusFromResult } from '@/constants/interactions';
import type { InteractionResult, LeadStatus } from '@prisma/client';

const EARLY: readonly LeadStatus[] = ['NEW', 'READY_TO_CONTACT'];
const LATER: readonly LeadStatus[] = [
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATION',
  'CUSTOMER',
  'LOST',
];

describe('suggestedStatusFromResult', () => {
  it.each(['SENT', 'NO_RESPONSE', 'CALLBACK'] as const)(
    '%s avança Novo e Pronto para Contatado',
    (result) => {
      for (const current of EARLY) {
        expect(suggestedStatusFromResult(result, current)).toBe('CONTACTED');
      }
    },
  );

  it.each(['SENT', 'NO_RESPONSE', 'CALLBACK'] as const)(
    '%s não regride funil a partir de Contatado',
    (result) => {
      for (const current of LATER) {
        expect(suggestedStatusFromResult(result, current)).toBeNull();
      }
    },
  );

  it('envio outbound (campanha/inbox) usa a regra SENT', () => {
    expect(outboundSendSuggestedStatus('NEW')).toBe('CONTACTED');
    expect(outboundSendSuggestedStatus('READY_TO_CONTACT')).toBe('CONTACTED');
    expect(outboundSendSuggestedStatus('QUALIFIED')).toBeNull();
    expect(outboundSendSuggestedStatus('LOST')).toBeNull();
  });

  it.each(['OPENED', 'RESPONDED', 'NO_INTEREST', 'INVALID_NUMBER', 'OTHER'] as const)(
    '%s não altera o funil em nenhum status',
    (result: InteractionResult) => {
      const all: LeadStatus[] = [...EARLY, ...LATER];
      for (const current of all) {
        expect(suggestedStatusFromResult(result, current)).toBeNull();
      }
    },
  );
});
