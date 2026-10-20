import { describe, expect, it } from 'vitest';

import {
  nextRecipientBatch,
  selectRecipients,
  takeRecipientLimit,
} from '@/server/queue/campaign-helpers';

const candidate = (leadId: string, phone: string) => ({ leadId, phone });

const EMPTY = {
  optedOutPhones: new Set<string>(),
  existingPhones: new Set<string>(),
  existingLeadIds: new Set<string>(),
  limit: null,
};

describe('selectRecipients', () => {
  it('um número = uma mensagem, mesmo em dois leads', () => {
    const result = selectRecipients(
      [
        candidate('empresa-1', '61982641957'),
        candidate('contato-9', '61982641957'),
        candidate('empresa-2', '61999998888'),
      ],
      EMPTY,
    );

    expect(result.rows.map((row) => row.leadId)).toEqual(['empresa-1', 'empresa-2']);
    expect(result.skippedDuplicatePhone).toBe(1);
  });

  it('fica o primeiro candidato da lista — escolha estável entre execuções', () => {
    const rows = [candidate('a', '61982641957'), candidate('b', '61982641957')];
    expect(selectRecipients(rows, EMPTY).rows[0]?.leadId).toBe('a');
    expect(selectRecipients(rows, EMPTY).rows[0]?.leadId).toBe('a');
  });

  it('opt-out do número tira o lead, mesmo sendo outro lead que pediu para sair', () => {
    const result = selectRecipients(
      [candidate('empresa-1', '61982641957'), candidate('empresa-2', '61999998888')],
      { ...EMPTY, optedOutPhones: new Set(['61982641957']) },
    );

    expect(result.rows.map((row) => row.leadId)).toEqual(['empresa-2']);
    expect(result.skippedOptOut).toBe(1);
  });

  it('opt-out sai antes da deduplicação: o número não ocupa vaga', () => {
    const result = selectRecipients(
      [candidate('empresa-1', '61982641957'), candidate('contato-9', '61982641957')],
      { ...EMPTY, optedOutPhones: new Set(['61982641957']) },
    );

    expect(result.rows).toHaveLength(0);
    expect(result.skippedOptOut).toBe(2);
    expect(result.skippedDuplicatePhone).toBe(0);
  });

  it('número já na campanha não entra de novo por outro lead', () => {
    const result = selectRecipients(
      [candidate('contato-9', '61982641957'), candidate('empresa-2', '61999998888')],
      { ...EMPTY, existingPhones: new Set(['61982641957']) },
    );

    expect(result.rows.map((row) => row.leadId)).toEqual(['empresa-2']);
    expect(result.skippedDuplicatePhone).toBe(1);
  });

  it('lead já na campanha não entra de novo', () => {
    const result = selectRecipients(
      [candidate('a', '61982641957'), candidate('b', '61999998888')],
      { ...EMPTY, existingLeadIds: new Set(['a']) },
    );

    expect(result.rows.map((row) => row.leadId)).toEqual(['b']);
  });

  it('o teto conta números únicos, não leads', () => {
    const result = selectRecipients(
      [
        candidate('a', '61982641957'),
        candidate('b', '61982641957'),
        candidate('c', '61999998888'),
      ],
      { ...EMPTY, limit: 2 },
    );

    expect(result.rows.map((row) => row.leadId)).toEqual(['a', 'c']);
  });

  it('público vazio devolve nada sem erro', () => {
    expect(selectRecipients([], EMPTY)).toEqual({
      rows: [],
      skippedOptOut: 0,
      skippedDuplicatePhone: 0,
    });
  });
});

describe('takeRecipientLimit', () => {
  it('sem teto devolve tudo', () => {
    expect(takeRecipientLimit([1, 2, 3], null)).toEqual([1, 2, 3]);
    expect(takeRecipientLimit([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it('corta no teto', () => {
    expect(takeRecipientLimit([1, 2, 3], 2)).toEqual([1, 2]);
  });
});

describe('nextRecipientBatch', () => {
  it('tira quem já está e só então aplica o teto', () => {
    const rows = [candidate('a', '1'), candidate('b', '2'), candidate('c', '3')];
    expect(nextRecipientBatch(rows, new Set(['a']), 1).map((row) => row.leadId)).toEqual(['b']);
  });
});
