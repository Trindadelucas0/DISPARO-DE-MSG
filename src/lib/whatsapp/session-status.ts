/**
 * Status persistido da sessão Baileys. A UI e o envio do lead leem o banco;
 * o worker é quem escreve. Desconectada só vale quando a credencial foi apagada.
 */

export const BAILEYS_DISCONNECT = {
  loggedOut: 401,
  connectionReplaced: 440,
  restartRequired: 515,
} as const;

export type PersistedSessionStatus = 'DISCONNECTED' | 'CONNECTING';

/** Logout real (401) apaga creds. 515, replaced e close sem código não apagam. */
export function shouldWipeAuthOnDisconnect(code: number | undefined): boolean {
  return code === BAILEYS_DISCONNECT.loggedOut;
}

/**
 * Close transitório deixa Conectando: o worker reabre com creds.json e o send
 * continua. Desconectada só depois de wipe (logout) — senão a tela mente.
 */
export function sessionStatusAfterDisconnect(authWiped: boolean): PersistedSessionStatus {
  return authWiped ? 'DISCONNECTED' : 'CONNECTING';
}

export function shouldReconnectAfterDisconnect(input: {
  readonly authWiped: boolean;
  readonly starting: boolean;
}): boolean {
  return !input.starting && !input.authWiped;
}

export function isBaileysSocketReady(userId: string | null | undefined): boolean {
  return Boolean(userId);
}

export const WA_SESSION_OWNER_TTL_SEC = 45;

export function whatsappSessionOwnerKey(accountId: string): string {
  return `crm:whatsapp:owner:${accountId}`;
}
