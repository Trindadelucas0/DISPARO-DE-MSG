import { manualContactCnpj } from '@/lib/manual-contact';
import { isLidJid, resolveInboundSender } from '@/lib/whatsapp/inbound-guard';
import { nationalPhoneDigits, parsePhone } from '@/lib/validation/phone';

/** Origem gravada em lead importado da agenda WhatsApp. */
export const WHATSAPP_LEAD_SOURCE = 'WHATSAPP';

export const MAX_WHATSAPP_CONTACTS = 10_000;

export type WhatsAppImportedContact = {
  readonly phone: string;
  readonly name: string;
};

export type RawWhatsAppParty = {
  readonly id?: string | null;
  readonly lid?: string | null;
  readonly jidAlt?: string | null;
  readonly phoneNumber?: string | null;
  readonly name?: string | null;
  readonly notify?: string | null;
  readonly verifiedName?: string | null;
  readonly pushName?: string | null;
};

export type WhatsAppContactStore = {
  readonly byPhone: Map<string, WhatsAppImportedContact>;
  readonly skippedJids: Set<string>;
  readonly pendingLids: Map<string, RawWhatsAppParty>;
};

export type ExistingLeadPhoneRow = {
  readonly id: string;
  readonly whatsapp: string | null;
  readonly telefone: string | null;
  readonly phones: readonly string[];
};

export type WhatsAppLeadCreateRow = {
  readonly cnpj: string;
  readonly razaoSocial: string;
  readonly nomeFantasia: string;
  readonly whatsapp: string | null;
  readonly telefone: string | null;
  readonly phones: string[];
  readonly origem: typeof WHATSAPP_LEAD_SOURCE;
  readonly status: 'NEW';
  readonly situacaoCadastral: 'ATIVA';
};

export type WhatsAppImportPlan = {
  readonly create: readonly WhatsAppLeadCreateRow[];
  readonly fillWhatsapp: readonly { readonly id: string; readonly whatsapp: string }[];
  readonly matched: number;
  readonly skipped: number;
};

export function createWhatsAppContactStore(): WhatsAppContactStore {
  return { byPhone: new Map(), skippedJids: new Set(), pendingLids: new Map() };
}

export function isIgnorableWhatsAppJid(jid: string | null | undefined): boolean {
  if (!jid) return true;
  if (jid === 'status@broadcast') return true;
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) {
    return true;
  }
  return false;
}

export function asImportedParty(raw: unknown): RawWhatsAppParty {
  const row = (raw ?? {}) as Record<string, unknown>;
  const str = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
  };
  return {
    id: str('id'),
    lid: str('lid', 'lidJid', 'accountLid'),
    jidAlt: str('jidAlt', 'remoteJidAlt'),
    phoneNumber: str('phoneNumber', 'pnJid', 'pn'),
    name: str('name', 'displayName', 'fullName'),
    notify: str('notify'),
    verifiedName: str('verifiedName'),
    pushName: str('pushName'),
  };
}

export function contactDisplayName(party: RawWhatsAppParty, fallbackPhone: string): string {
  const candidates = [party.name, party.notify, party.verifiedName, party.pushName];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed.slice(0, 120);
  }
  return fallbackPhone;
}

export function phoneMatchKey(digits: string): string {
  return nationalPhoneDigits(digits).slice(-11);
}

export function phoneMatchVariants(raw: string): string[] {
  const national = nationalPhoneDigits(raw);
  if (national.length < 10) return [];
  const last11 = national.slice(-11);
  const last10 = national.slice(-10);
  const out = new Set<string>([national, last11, last10]);
  if (last11.length === 11 && last11[2] === '9') {
    out.add(`${last11.slice(0, 2)}${last11.slice(3)}`);
  }
  if (last10.length === 10) {
    out.add(`${last10.slice(0, 2)}9${last10.slice(2)}`);
  }
  out.add(`55${national}`);
  return [...out].filter((value) => value.length >= 10 && value.length <= 13);
}

export function leadMatchesImportedPhone(lead: ExistingLeadPhoneRow, phone: string): boolean {
  const wanted = new Set(phoneMatchVariants(phone));
  if (wanted.size === 0) return false;
  const fields = [lead.whatsapp, lead.telefone, ...lead.phones];
  for (const field of fields) {
    if (!field) continue;
    const national = nationalPhoneDigits(field);
    if (wanted.has(field) || wanted.has(national) || wanted.has(national.slice(-11))) return true;
    if (national.length >= 10 && wanted.has(national.slice(-10))) return true;
  }
  return false;
}

function partyJid(party: RawWhatsAppParty): string {
  return party.id || party.lid || '';
}

function resolveInboundPhone(party: RawWhatsAppParty): string | null {
  const candidates = [party.phoneNumber, party.jidAlt, party.id, party.lid];
  for (const raw of candidates) {
    if (!raw || isLidJid(raw) || isIgnorableWhatsAppJid(raw)) continue;
    const parsed = parsePhone(resolveInboundSender(raw, null));
    if (parsed) return parsed.digits;
  }
  return null;
}

export function rememberWhatsAppParty(
  store: WhatsAppContactStore,
  party: RawWhatsAppParty,
  ownPhone?: string | null,
): 'ok' | 'skipped' {
  const jid = partyJid(party);
  if (isIgnorableWhatsAppJid(jid) && isIgnorableWhatsAppJid(party.lid)) {
    if (jid) store.skippedJids.add(jid);
    return 'skipped';
  }

  const phone = resolveInboundPhone(party);
  const parsed = phone ? parsePhone(phone) : null;
  const own = ownPhone ? nationalPhoneDigits(ownPhone) : '';
  if (!parsed) {
    if (isLidJid(jid) || isLidJid(party.lid || '')) {
      store.pendingLids.set(jid || party.lid || '', party);
      return 'skipped';
    }
    if (jid) store.skippedJids.add(jid);
    return 'skipped';
  }
  if (own && (parsed.digits === own || parsed.digits.slice(-11) === own.slice(-11))) {
    if (jid) store.skippedJids.add(jid);
    return 'skipped';
  }

  const key = phoneMatchKey(parsed.digits);
  const name = contactDisplayName(party, parsed.digits);
  const previous = store.byPhone.get(key);
  if (!previous || (previous.name === previous.phone && name !== parsed.digits)) {
    store.byPhone.set(key, { phone: parsed.digits, name });
  }
  store.skippedJids.delete(jid);
  store.pendingLids.delete(jid);
  if (party.lid) store.pendingLids.delete(party.lid);
  return 'ok';
}

export async function resolvePendingLidPhones(
  store: WhatsAppContactStore,
  lookup: (lid: string) => Promise<string | null>,
  ownPhone?: string | null,
): Promise<number> {
  const pending = [...store.pendingLids.entries()];
  let resolved = 0;
  for (const [jid, party] of pending) {
    const pn = await lookup(jid).catch(() => null);
    const alt = pn || (party.lid ? await lookup(party.lid).catch(() => null) : null);
    if (!alt) continue;
    const result = rememberWhatsAppParty(
      store,
      { ...party, phoneNumber: alt, jidAlt: alt },
      ownPhone,
    );
    if (result === 'ok') {
      store.pendingLids.delete(jid);
      resolved += 1;
    }
  }
  return resolved;
}

export function snapshotWhatsAppContacts(store: WhatsAppContactStore): {
  readonly contacts: WhatsAppImportedContact[];
  readonly skipped: number;
} {
  const contacts = [...store.byPhone.values()].slice(0, MAX_WHATSAPP_CONTACTS);
  return { contacts, skipped: store.skippedJids.size + store.pendingLids.size };
}

export function asPartyList(payload: unknown): RawWhatsAppParty[] {
  if (Array.isArray(payload)) return payload.map((item) => asImportedParty(item));
  if (payload && typeof payload === 'object') {
    const record = payload as { contacts?: unknown; chats?: unknown };
    if (Array.isArray(record.contacts)) return record.contacts.map((item) => asImportedParty(item));
    if (Array.isArray(record.chats)) return record.chats.map((item) => asImportedParty(item));
  }
  return [];
}

export function ingestWhatsAppPayload(
  store: WhatsAppContactStore,
  payload: unknown,
  ownPhone?: string | null,
): void {
  if (payload == null) return;
  if (Array.isArray(payload)) {
    for (const party of payload) {
      rememberWhatsAppParty(store, asImportedParty(party), ownPhone);
    }
    return;
  }
  if (typeof payload !== 'object') return;
  const record = payload as {
    contacts?: unknown;
    chats?: unknown;
    messages?: unknown;
    lidPnMappings?: unknown;
  };
  const hasBundles =
    Array.isArray(record.contacts) ||
    Array.isArray(record.chats) ||
    Array.isArray(record.messages) ||
    Array.isArray(record.lidPnMappings);
  if (Array.isArray(record.contacts)) {
    for (const party of record.contacts) {
      rememberWhatsAppParty(store, asImportedParty(party), ownPhone);
    }
  }
  if (Array.isArray(record.chats)) {
    for (const party of record.chats) {
      rememberWhatsAppParty(store, asImportedParty(party), ownPhone);
    }
  }
  if (Array.isArray(record.messages)) {
    for (const item of record.messages) {
      const msg = item as {
        key?: { remoteJid?: string | null; remoteJidAlt?: string | null };
        pushName?: string | null;
      };
      rememberWhatsAppParty(
        store,
        asImportedParty({
          id: msg.key?.remoteJid,
          jidAlt: msg.key?.remoteJidAlt,
          phoneNumber: msg.key?.remoteJidAlt,
          name: msg.pushName,
        }),
        ownPhone,
      );
    }
  }
  if (Array.isArray(record.lidPnMappings)) {
    for (const item of record.lidPnMappings) {
      const pair = item as { lid?: string; pn?: string };
      rememberWhatsAppParty(
        store,
        asImportedParty({ id: pair.lid, lid: pair.lid, phoneNumber: pair.pn }),
        ownPhone,
      );
    }
  }
  if (!hasBundles) {
    rememberWhatsAppParty(store, asImportedParty(record), ownPhone);
  }
}

export function classifyWhatsAppImport(
  contacts: readonly WhatsAppImportedContact[],
  existing: readonly ExistingLeadPhoneRow[],
  extraSkipped = 0,
): WhatsAppImportPlan {
  const seen = new Set<string>();
  const create: WhatsAppLeadCreateRow[] = [];
  const fillWhatsapp: { id: string; whatsapp: string }[] = [];
  let matched = 0;
  let skipped = extraSkipped;

  for (const contact of contacts) {
    const parsed = parsePhone(contact.phone);
    const key = phoneMatchKey(contact.phone);
    if (!parsed || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const lead = existing.find((row) => leadMatchesImportedPhone(row, parsed.digits));
    if (lead) {
      matched += 1;
      if (!lead.whatsapp && parsed.isMobile) {
        fillWhatsapp.push({ id: lead.id, whatsapp: parsed.digits });
      }
      continue;
    }

    create.push({
      cnpj: manualContactCnpj(parsed.digits),
      razaoSocial: contact.name.trim() || parsed.digits,
      nomeFantasia: contact.name.trim() || parsed.digits,
      whatsapp: parsed.isMobile ? parsed.digits : null,
      telefone: parsed.isMobile ? null : parsed.digits,
      phones: [parsed.digits],
      origem: WHATSAPP_LEAD_SOURCE,
      status: 'NEW',
      situacaoCadastral: 'ATIVA',
    });
  }

  return { create, fillWhatsapp, matched, skipped };
}
