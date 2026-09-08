import {
  evolutionWebhookTargetUrl,
  requireEvolutionConfig,
  type EvolutionConfig,
} from '@/lib/evolution/config';

type Json = Record<string, unknown>;

export class EvolutionApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EvolutionApiError';
    this.status = status;
  }
}

function evolutionErrorMessage(data: Json, status: number) {
  const nested = data.response as Json | undefined;
  const raw = nested?.message ?? data.message ?? data.error;
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw.map(String).join(' ');
  return `Evolution API erro ${status}`;
}

async function evolutionFetch(path: string, init: RequestInit = {}, config?: EvolutionConfig) {
  const cfg = config ?? requireEvolutionConfig();
  const response = await fetch(`${cfg.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.apiKey,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let data: Json = {};
  if (text) {
    try {
      data = JSON.parse(text) as Json;
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    throw new EvolutionApiError(evolutionErrorMessage(data, response.status), response.status);
  }
  return data;
}

const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
] as const;

export async function createEvolutionInstance(instanceName: string, webhookUrl?: string) {
  const cfg = requireEvolutionConfig();
  const webhook = webhookUrl
    ? {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        byEvents: false,
        base64: true,
        events: [...WEBHOOK_EVENTS],
      }
    : undefined;

  return evolutionFetch(
    '/instance/create',
    {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        syncFullHistory: false,
        ...(webhook ? { webhook } : {}),
      }),
    },
    cfg,
  );
}

export async function setEvolutionInstanceSettings(instanceName: string) {
  return evolutionFetch(`/settings/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    }),
  });
}

export async function fetchEvolutionInstances() {
  return evolutionFetch('/instance/fetchInstances');
}

export async function connectEvolutionInstance(instanceName: string) {
  return evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
}

export function isMissingInstanceError(error: unknown) {
  if (!(error instanceof EvolutionApiError) || error.status !== 404) return false;
  return /does not exist|not found|não existe/i.test(error.message);
}

export async function getEvolutionConnectionState(instanceName: string) {
  return evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export async function logoutEvolutionInstance(instanceName: string) {
  return evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

export async function deleteEvolutionInstance(instanceName: string) {
  return evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

function asJson(value: unknown): Json | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Json;
  return null;
}

export function evolutionHasInstance(payload: unknown, instanceName: string) {
  const json = asJson(payload);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(json?.instance)
      ? (json.instance as unknown[])
      : Array.isArray(json?.instances)
        ? (json.instances as unknown[])
        : json
          ? [json]
          : [];

  return items.some((item) => {
    const node = asJson(item);
    const nested = asJson(node?.instance);
    const names = [node?.name, node?.instanceName, nested?.instanceName, nested?.name];
    return names.some((name) => name === instanceName);
  });
}

export async function setEvolutionWebhook(instanceName: string, webhookUrl: string) {
  const cfg = requireEvolutionConfig();
  const headers = {
    apikey: cfg.apiKey,
    'x-webhook-secret': cfg.webhookSecret,
  };
  const events = [...WEBHOOK_EVENTS];

  return evolutionFetch(
    `/webhook/set/${encodeURIComponent(instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        byEvents: false,
        base64: true,
        headers,
        events,
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          headers,
          events,
        },
      }),
    },
    cfg,
  );
}

export async function sendEvolutionText(instanceName: string, number: string, text: string) {
  return evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({ number, text }),
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilEvolutionInstanceGone(instanceName: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const list = await fetchEvolutionInstances().catch(() => null);
    if (!list || !evolutionHasInstance(list, instanceName)) return;
    await sleep(400);
  }
}

export async function recreateEvolutionInstance(instanceName: string) {
  try {
    await logoutEvolutionInstance(instanceName);
  } catch {
    /* já desconectada */
  }
  try {
    await deleteEvolutionInstance(instanceName);
  } catch {
    /* pode não existir */
  }
  await waitUntilEvolutionInstanceGone(instanceName);
  await sleep(800);
  const created = await createEvolutionInstance(instanceName, evolutionWebhookTargetUrl());
  await setEvolutionInstanceSettings(instanceName).catch(() => undefined);
  return created;
}

export type ConnectUntilQrResult = {
  payload: Json;
  qr: string | null;
};

/**
 * Cria/reconecta a instância e tenta obter QR. Aceita hooks injetáveis para testes.
 */
export async function connectUntilQr(
  instanceName: string,
  deps: {
    resolveQr: (payload: Json) => Promise<string | null>;
    readStoredQr?: () => Promise<string | null>;
    recreate?: typeof recreateEvolutionInstance;
    connect?: typeof connectEvolutionInstance;
    setWebhook?: typeof setEvolutionWebhook;
    setSettings?: typeof setEvolutionInstanceSettings;
    getState?: typeof getEvolutionConnectionState;
    extractState?: (payload: Json) => string | null;
  },
): Promise<ConnectUntilQrResult> {
  const recreate = deps.recreate ?? recreateEvolutionInstance;
  const connect = deps.connect ?? connectEvolutionInstance;
  const setWebhook = deps.setWebhook ?? setEvolutionWebhook;
  const setSettings = deps.setSettings ?? setEvolutionInstanceSettings;
  const getState = deps.getState ?? getEvolutionConnectionState;

  let lastPayload: Json = {};
  try {
    lastPayload = await recreate(instanceName);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/already|exist/i.test(message)) throw error;
  }

  try {
    await setWebhook(instanceName, evolutionWebhookTargetUrl());
  } catch {
    /* webhook pode falhar em localhost */
  }
  await setSettings(instanceName).catch(() => undefined);

  let qr = await deps.resolveQr(lastPayload);
  if (qr) return { payload: lastPayload, qr };

  try {
    lastPayload = await connect(instanceName);
  } catch (error) {
    if (isMissingInstanceError(error)) {
      lastPayload = await recreate(instanceName);
      await setWebhook(instanceName, evolutionWebhookTargetUrl()).catch(() => undefined);
      await setSettings(instanceName).catch(() => undefined);
    } else {
      throw error;
    }
  }

  qr = await deps.resolveQr(lastPayload);
  if (qr) return { payload: lastPayload, qr };

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const stored = deps.readStoredQr ? await deps.readStoredQr() : null;
    if (stored) return { payload: lastPayload, qr: stored };

    const statePayload = (await getState(instanceName).catch(() => ({}))) as Json;
    const state = deps.extractState?.(statePayload) ?? null;
    if (state === 'open' || state === 'connected') {
      return { payload: statePayload, qr: null };
    }

    qr = await deps.resolveQr(statePayload);
    if (qr) return { payload: statePayload, qr };

    await sleep(800);
  }

  const stored = deps.readStoredQr ? await deps.readStoredQr() : null;
  return { payload: lastPayload, qr: stored ?? (await deps.resolveQr(lastPayload)) };
}
