import { describe, expect, it } from 'vitest';

import {
  BAILEYS_DISCONNECT,
  isBaileysSocketReady,
  sessionStatusAfterDisconnect,
  shouldReconnectAfterDisconnect,
  shouldWipeAuthOnDisconnect,
  whatsappSessionOwnerKey,
} from '@/lib/whatsapp/session-status';

describe('status da sessão Baileys após close', () => {
  it('só apaga credencial no logout 401', () => {
    expect(shouldWipeAuthOnDisconnect(BAILEYS_DISCONNECT.loggedOut)).toBe(true);
    expect(shouldWipeAuthOnDisconnect(BAILEYS_DISCONNECT.restartRequired)).toBe(false);
    expect(shouldWipeAuthOnDisconnect(BAILEYS_DISCONNECT.connectionReplaced)).toBe(false);
    expect(shouldWipeAuthOnDisconnect(undefined)).toBe(false);
  });

  it('close transitório não vira Desconectada', () => {
    expect(sessionStatusAfterDisconnect(false)).toBe('CONNECTING');
    expect(sessionStatusAfterDisconnect(true)).toBe('DISCONNECTED');
  });

  it('reconecta se ainda há credencial e o startSocket não está no meio', () => {
    expect(shouldReconnectAfterDisconnect({ authWiped: false, starting: false })).toBe(true);
    expect(shouldReconnectAfterDisconnect({ authWiped: false, starting: true })).toBe(false);
    expect(shouldReconnectAfterDisconnect({ authWiped: true, starting: false })).toBe(false);
  });

  it('socket só está pronto com JID do usuário (connection open)', () => {
    expect(isBaileysSocketReady('553899999999:2@s.whatsapp.net')).toBe(true);
    expect(isBaileysSocketReady(undefined)).toBe(false);
    expect(isBaileysSocketReady(null)).toBe(false);
    expect(isBaileysSocketReady('')).toBe(false);
  });

  it('chave de dono da sessão é por conta', () => {
    expect(whatsappSessionOwnerKey('acc-1')).toBe('crm:whatsapp:owner:acc-1');
  });
});
