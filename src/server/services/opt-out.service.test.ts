import { describe, expect, it } from 'vitest';

import { optOutPhoneVariants } from '@/server/services/opt-out.service';

describe('optOutPhoneVariants', () => {
  it('procura o número nacional e a forma com 55', () => {
    expect(optOutPhoneVariants('61982641957')).toEqual(['61982641957', '5561982641957']);
  });

  it('normaliza o que vem com 55 para a mesma dupla', () => {
    expect(optOutPhoneVariants('5561982641957')).toEqual(['61982641957', '5561982641957']);
  });

  it('ignora máscara e espaço', () => {
    expect(optOutPhoneVariants('(61) 98264-1957')).toEqual(['61982641957', '5561982641957']);
  });

  it('sem dígito não procura nada', () => {
    expect(optOutPhoneVariants('')).toEqual([]);
    expect(optOutPhoneVariants(null)).toEqual([]);
    expect(optOutPhoneVariants('sem número')).toEqual([]);
  });
});
