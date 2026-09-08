import { describe, expect, it } from 'vitest';

import { manualLeadSchema } from '@/features/leads/schema';

describe('manualLeadSchema', () => {
  it('exige nome com pelo menos 2 caracteres', () => {
    expect(manualLeadSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(manualLeadSchema.safeParse({ name: 'Ana', whatsapp: '38998100827' }).success).toBe(
      true,
    );
  });

  it('aceita WhatsApp e CNPJ vazios', () => {
    const parsed = manualLeadSchema.parse({ name: 'Ana', whatsapp: '', cnpj: '' });
    expect(parsed.whatsapp).toBe('');
    expect(parsed.cnpj).toBe('');
  });
});
