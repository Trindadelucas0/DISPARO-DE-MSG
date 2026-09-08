import { describe, expect, it } from 'vitest';

import { isConnectedSendableAccount, pickConnectedSendableAccount } from '@/constants/whatsapp';

describe('conta WhatsApp enviável', () => {
  it('recusa manual mesmo CONNECTED', () => {
    expect(
      isConnectedSendableAccount({ provider: 'LEGACY_MANUAL', sessionStatus: 'CONNECTED' }),
    ).toBe(false);
  });

  it('aceita Baileys CONNECTED', () => {
    expect(isConnectedSendableAccount({ provider: 'BAILEYS', sessionStatus: 'CONNECTED' })).toBe(
      true,
    );
  });

  it('escolhe WhatsApp Web CONNECTED e ignora mock/manual', () => {
    const picked = pickConnectedSendableAccount([
      { id: 'manual', provider: 'LEGACY_MANUAL', sessionStatus: 'CONNECTED' },
      { id: 'qr', provider: 'BAILEYS', sessionStatus: 'QR_CODE' },
      { id: 'ok', provider: 'BAILEYS', sessionStatus: 'CONNECTED' },
      { id: 'mock', provider: 'MOCK', sessionStatus: 'CONNECTED' },
    ]);
    expect(picked?.id).toBe('ok');
    expect(
      pickConnectedSendableAccount([
        { id: 'mock', provider: 'MOCK', sessionStatus: 'CONNECTED' },
      ]),
    ).toBeUndefined();
  });
});
