import { describe, expect, it } from 'vitest';

import { identityCssVar, identitySlot } from '@/lib/identity';

describe('record avatar hash', () => {
  it('mesmo CNPJ (com ou sem máscara) cai no mesmo --identity-N', () => {
    const raw = '12345678000195';
    const masked = '12.345.678/0001-95';
    expect(identitySlot(raw)).toBe(identitySlot(masked));
    expect(identityCssVar(raw)).toBe(identityCssVar(masked));
    expect(identityCssVar(raw)).toMatch(/^var\(--identity-[0-5]\)$/);
  });

  it('CNPJs diferentes podem cair em slots diferentes (hash estável)', () => {
    const a = identitySlot('00000000000191');
    const b = identitySlot('00000000000191');
    expect(a).toBe(b);
    expect(identityCssVar('00000000000191')).toBe(`var(--identity-${a})`);
  });
});
