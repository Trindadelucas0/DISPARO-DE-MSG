import { normalizeInboundPhone } from '@/lib/whatsapp/inbound-guard';

/**
 * WhatsApp exige JID com DDI (`55…@s.whatsapp.net`).
 * `normalizeInboundPhone` tira o 55 de propósito (match de conversa). Não reutilizar no send.
 */
export function outboundWhatsAppJidCandidates(raw: string): string[] {
  const national = normalizeInboundPhone(raw);
  if (national.length < 10 || national.length > 11) return [];
  const jids = [`55${national}@s.whatsapp.net`];
  if (national.length === 11 && national[2] === '9') {
    jids.push(`55${national.slice(0, 2)}${national.slice(3)}@s.whatsapp.net`);
  }
  return [...new Set(jids)];
}

export type WhatsAppExistsRow = {
  readonly jid: string;
  readonly exists: boolean;
};

export function resolveOutboundWhatsAppJid(params: {
  readonly rawTo: string;
  readonly lookup?: readonly WhatsAppExistsRow[] | null;
}): { ok: true; jid: string } | { ok: false; error: string } {
  const candidates = outboundWhatsAppJidCandidates(params.rawTo);
  if (candidates.length === 0) {
    return { ok: false, error: 'Número inválido para WhatsApp.' };
  }

  if (params.lookup == null) {
    const jid = candidates[0];
    if (!jid) return { ok: false, error: 'Número inválido para WhatsApp.' };
    return { ok: true, jid };
  }

  const found = params.lookup.find((row) => row.exists && row.jid);
  if (!found) {
    return {
      ok: false,
      error: 'Este número não está no WhatsApp. Confira o DDD e o nono dígito.',
    };
  }

  const jid = found.jid.includes('@') ? found.jid : `${found.jid}@s.whatsapp.net`;
  return { ok: true, jid };
}
