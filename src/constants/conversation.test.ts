import { describe, expect, it } from 'vitest';

import {
  inboxAttachLeadOwnerId,
  shouldAssignLeadOwner,
  shouldNotifyConversationRead,
  transferSliceStartIndex,
} from '@/constants/conversation';

describe('shouldAssignLeadOwner', () => {
  it('não sincroniza conversa sem lead', () => {
    expect(
      shouldAssignLeadOwner({
        leadId: null,
        currentResponsavelId: null,
        toUserId: 'seller',
      }),
    ).toBe(false);
  });

  it('não sincroniza se o lead já é do destino', () => {
    expect(
      shouldAssignLeadOwner({
        leadId: 'lead-1',
        currentResponsavelId: 'seller',
        toUserId: 'seller',
      }),
    ).toBe(false);
  });

  it('sincroniza lead sem responsável ou de outro vendedor', () => {
    expect(
      shouldAssignLeadOwner({
        leadId: 'lead-1',
        currentResponsavelId: null,
        toUserId: 'seller',
      }),
    ).toBe(true);
    expect(
      shouldAssignLeadOwner({
        leadId: 'lead-1',
        currentResponsavelId: 'other',
        toUserId: 'seller',
      }),
    ).toBe(true);
  });
});

describe('shouldNotifyConversationRead', () => {
  it('não emite evento se a conversa já está lida', () => {
    expect(shouldNotifyConversationRead(0)).toBe(false);
  });

  it('emite evento só quando há não lidas', () => {
    expect(shouldNotifyConversationRead(1)).toBe(true);
    expect(shouldNotifyConversationRead(3)).toBe(true);
  });
});

describe('inboxAttachLeadOwnerId', () => {
  it('usa o responsável da conversa quando existe', () => {
    expect(inboxAttachLeadOwnerId('assigned', 'actor')).toBe('assigned');
  });

  it('usa o ator se a conversa não tem responsável', () => {
    expect(inboxAttachLeadOwnerId(null, 'actor')).toBe('actor');
    expect(inboxAttachLeadOwnerId(undefined, 'actor')).toBe('actor');
  });
});

describe('transferSliceStartIndex', () => {
  it('não fatia uma única campanha ou só inbound', () => {
    expect(
      transferSliceStartIndex([
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: 'a' },
        { direction: 'INBOUND', kind: 'TEXT', campaignId: 'a' },
      ]),
    ).toBe(0);
    expect(
      transferSliceStartIndex([
        { direction: 'INBOUND', kind: 'TEXT', campaignId: null },
        { direction: 'INBOUND', kind: 'TEXT', campaignId: null },
      ]),
    ).toBe(0);
  });

  it('fatia a partir da campanha mais recente quando há várias ondas', () => {
    expect(
      transferSliceStartIndex([
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: 'c9ln4v' },
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: 'rz5qbr' },
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: null },
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: '8r5yec' },
      ]),
    ).toBe(3);
  });

  it('ignora resposta TEXT herdada da conversa ao escolher a onda', () => {
    expect(
      transferSliceStartIndex([
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: 'a' },
        { direction: 'OUTBOUND', kind: 'TEMPLATE', campaignId: 'b' },
        { direction: 'OUTBOUND', kind: 'TEXT', campaignId: 'a' },
      ]),
    ).toBe(1);
  });
});
