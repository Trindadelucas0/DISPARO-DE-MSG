/**
 * Extração de QR e estado de conexão a partir dos payloads da Evolution API.
 * Testável sem rede.
 */

type Json = Record<string, unknown>;

function asJson(value: unknown): Json | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Json;
  }
  return null;
}

function collectQrNodes(payload: Json): Json[] {
  const data = asJson(payload.data);
  const qrcode =
    asJson(payload.qrcode) ??
    asJson(data?.qrcode) ??
    asJson(payload.qr) ??
    asJson(data?.qr);

  return [payload, data, qrcode, asJson(payload.instance), asJson(data?.instance)].filter(
    (item): item is Json => Boolean(item),
  );
}

function isQrImageValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 40 &&
    !value.startsWith('2@') &&
    (value.startsWith('data:image') || value.startsWith('iVBOR') || value.length > 80)
  );
}

export function extractQrBase64(payload: Json): string | null {
  for (const node of collectQrNodes(payload)) {
    const candidates = [node.base64, node.qrcode, node.qr, asJson(node.qrcode)?.base64];
    for (const item of candidates) {
      if (isQrImageValue(item)) {
        return item.startsWith('data:') ? item : `data:image/png;base64,${item}`;
      }
    }
  }
  return null;
}

export function extractQrRawCode(payload: Json): string | null {
  for (const node of collectQrNodes(payload)) {
    const candidates = [node.code, asJson(node.qrcode)?.code];
    for (const item of candidates) {
      if (typeof item === 'string' && item.length > 8) {
        return item;
      }
    }
  }
  return null;
}

export async function resolveQrImage(
  payload: Json,
  toDataUrl?: (code: string) => Promise<string>,
): Promise<string | null> {
  const base64 = extractQrBase64(payload);
  if (base64) return base64;

  const code = extractQrRawCode(payload);
  if (!code) return null;

  if (toDataUrl) return toDataUrl(code);

  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(code, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'L',
  });
}

export function extractConnectionState(payload: Json): string | null {
  for (const node of collectQrNodes(payload)) {
    const state = node.state ?? node.connectionStatus ?? asJson(node.instance)?.state;
    if (typeof state === 'string') return state.toLowerCase();
  }
  return null;
}

export function mapEvolutionStateToSession(
  state: string | null,
): 'DISCONNECTED' | 'CONNECTING' | 'QR_CODE' | 'CONNECTED' | 'FAILED' {
  if (!state) return 'CONNECTING';
  if (state.includes('open') || state.includes('connected')) return 'CONNECTED';
  if (state.includes('qr') || state.includes('pairing')) return 'QR_CODE';
  if (state.includes('close') || state.includes('refused')) return 'DISCONNECTED';
  if (state.includes('error') || state.includes('fail')) return 'FAILED';
  if (state.includes('connecting')) return 'CONNECTING';
  return 'CONNECTING';
}

export function extractInstanceNameFromPayload(payload: Json): string | null {
  const candidates = [
    payload.instance,
    asJson(payload.instance)?.instanceName,
    asJson(payload.instance)?.name,
    asJson(payload.data)?.instance,
    asJson(asJson(payload.data)?.instance)?.instanceName,
    payload.instanceName,
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return null;
}

export function extractPhoneFromPayload(payload: Json): string | null {
  for (const node of collectQrNodes(payload)) {
    const phone = node.owner ?? node.wuid ?? node.phoneNumber ?? node.number;
    if (typeof phone === 'string' && phone.trim()) {
      return phone.replace(/@.*/, '').replace(/\D/g, '') || null;
    }
  }
  return null;
}

export function extractInboundMessage(payload: Json): {
  from: string;
  body: string;
  providerMessageId: string;
} | null {
  const data = asJson(payload.data) ?? payload;
  const key = asJson(data.key) ?? asJson(asJson(data.message)?.key);
  const remoteJid = typeof key?.remoteJid === 'string' ? key.remoteJid : null;
  const fromMe = Boolean(key?.fromMe);
  if (fromMe || !remoteJid || remoteJid.includes('@g.us')) return null;

  const from = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
  const message = asJson(data.message) ?? asJson(payload.message);
  const body =
    (typeof message?.conversation === 'string' && message.conversation) ||
    (typeof asJson(message?.extendedTextMessage)?.text === 'string' &&
      (asJson(message?.extendedTextMessage)?.text as string)) ||
    '';
  if (!from || !body.trim()) return null;

  const providerMessageId =
    (typeof key?.id === 'string' && key.id) ||
    (typeof data.id === 'string' && data.id) ||
    `evo-${Date.now()}`;

  return { from, body: body.trim(), providerMessageId };
}
