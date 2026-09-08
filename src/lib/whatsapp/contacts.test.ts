import { describe, expect, it } from 'vitest';

import { manualContactCnpj } from '@/lib/manual-contact';
import {
  asPartyList,
  classifyWhatsAppImport,
  createWhatsAppContactStore,
  ingestWhatsAppPayload,
  isIgnorableWhatsAppJid,
  leadMatchesImportedPhone,
  phoneMatchVariants,
  rememberWhatsAppParty,
  resolvePendingLidPhones,
  snapshotWhatsAppContacts,
  WHATSAPP_LEAD_SOURCE,
} from '@/lib/whatsapp/contacts';

describe('importação de contatos WhatsApp (puro)', () => {
  it('ignora grupo, broadcast e status', () => {
    expect(isIgnorableWhatsAppJid('120363@g.us')).toBe(true);
    expect(isIgnorableWhatsAppJid('status@broadcast')).toBe(true);
    expect(isIgnorableWhatsAppJid('123@broadcast')).toBe(true);
    expect(isIgnorableWhatsAppJid('5538998100827@s.whatsapp.net')).toBe(false);
  });

  it('não guarda grupo; LID sem telefone fica pendente', () => {
    const store = createWhatsAppContactStore();
    expect(rememberWhatsAppParty(store, { id: '120363-xyz@g.us', name: 'Time' })).toBe('skipped');
    expect(rememberWhatsAppParty(store, { id: '53455246884964@lid', name: 'Sem PN' })).toBe(
      'skipped',
    );
    expect(store.byPhone.size).toBe(0);
    expect(store.skippedJids.size).toBe(1);
    expect(store.pendingLids.size).toBe(1);
  });

  it('guarda 1:1, deduplica pelo telefone e prefere nome real', () => {
    const store = createWhatsAppContactStore();
    expect(
      rememberWhatsAppParty(store, { id: '5538998100827@s.whatsapp.net' }),
    ).toBe('ok');
    expect(
      rememberWhatsAppParty(store, {
        id: '5538998100827@s.whatsapp.net',
        name: 'Ana Locações',
      }),
    ).toBe('ok');
    const snap = snapshotWhatsAppContacts(store);
    expect(snap.contacts).toEqual([{ phone: '38998100827', name: 'Ana Locações' }]);
  });

  it('ignora o próprio número da conta', () => {
    const store = createWhatsAppContactStore();
    expect(
      rememberWhatsAppParty(
        store,
        { id: '5538998100827@s.whatsapp.net', name: 'Eu' },
        '38998100827',
      ),
    ).toBe('skipped');
    expect(store.byPhone.size).toBe(0);
  });

  it('usa pnJid/displayName do chat (agenda WhatsApp)', () => {
    const store = createWhatsAppContactStore();
    ingestWhatsAppPayload(store, {
      chats: [
        {
          id: '53455246884964@lid',
          pnJid: '5538998100827@s.whatsapp.net',
          displayName: 'Ana Locações',
        },
      ],
    });
    expect(snapshotWhatsAppContacts(store).contacts[0]).toEqual({
      phone: '38998100827',
      name: 'Ana Locações',
    });
  });

  it('usa phoneNumber do Baileys quando o id é LID', () => {
    const store = createWhatsAppContactStore();
    expect(
      rememberWhatsAppParty(store, {
        id: '53455246884964@lid',
        phoneNumber: '5538998100827@s.whatsapp.net',
        name: 'Ana',
      }),
    ).toBe('ok');
    expect(snapshotWhatsAppContacts(store).contacts[0]).toEqual({
      phone: '38998100827',
      name: 'Ana',
    });
  });

  it('usa remoteJidAlt / lid quando o id é LID', () => {
    const store = createWhatsAppContactStore();
    expect(
      rememberWhatsAppParty(store, {
        id: '53455246884964@lid',
        lid: '5538998100827@s.whatsapp.net',
        name: 'Ana',
      }),
    ).toBe('ok');
    expect(snapshotWhatsAppContacts(store).contacts[0]).toEqual({
      phone: '38998100827',
      name: 'Ana',
    });
  });

  it('asPartyList aceita array, contacts e chats', () => {
    expect(asPartyList([{ id: 'a' }])).toHaveLength(1);
    expect(asPartyList({ contacts: [{ id: 'a' }, { id: 'b' }] })).toHaveLength(2);
    expect(asPartyList({ chats: [{ id: 'c' }] })).toHaveLength(1);
    expect(asPartyList(null)).toEqual([]);
  });

  it('ingestWhatsAppPayload junta contacts e chats do history', () => {
    const store = createWhatsAppContactStore();
    ingestWhatsAppPayload(store, {
      contacts: [{ id: '5538998100827@s.whatsapp.net', name: 'Ana' }],
      chats: [{ id: '5511987654321@s.whatsapp.net', name: 'Bruno' }],
    });
    const phones = snapshotWhatsAppContacts(store)
      .contacts.map((row) => row.phone)
      .sort();
    expect(phones).toEqual(['11987654321', '38998100827']);
  });

  it('casa lead da planilha pelo array phones', () => {
    const lead = {
      id: 'lead-1',
      whatsapp: null,
      telefone: null,
      phones: ['38998100827'],
    };
    expect(leadMatchesImportedPhone(lead, '5538998100827')).toBe(true);
    expect(leadMatchesImportedPhone(lead, '11988887777')).toBe(false);
    expect(phoneMatchVariants('38998100827')).toContain('38998100827');
  });

  it('classifica: novo, já na base (planilha) e preenche whatsapp vazio', () => {
    const plan = classifyWhatsAppImport(
      [
        { phone: '38998100827', name: 'Ana' },
        { phone: '11987654321', name: 'Nova Ltda' },
        { phone: '38998100827', name: 'Ana de novo' },
      ],
      [
        {
          id: 'sheet-1',
          whatsapp: null,
          telefone: null,
          phones: ['38998100827'],
        },
      ],
      3,
    );
    expect(plan.matched).toBe(1);
    expect(plan.fillWhatsapp).toEqual([{ id: 'sheet-1', whatsapp: '38998100827' }]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]?.origem).toBe(WHATSAPP_LEAD_SOURCE);
    expect(plan.create[0]?.cnpj).toBe(manualContactCnpj('11987654321'));
    expect(plan.create[0]?.status).toBe('NEW');
    expect(plan.skipped).toBe(4);
  });

  it('resolve LID pendente pelo mapeamento do socket', async () => {
    const store = createWhatsAppContactStore();
    rememberWhatsAppParty(store, { id: '53455246884964@lid', name: 'Ana' });
    expect(store.byPhone.size).toBe(0);
    const resolved = await resolvePendingLidPhones(store, async (lid) =>
      lid.includes('@lid') ? '5538998100827@s.whatsapp.net' : null,
    );
    expect(resolved).toBe(1);
    expect(snapshotWhatsAppContacts(store).contacts[0]).toEqual({
      phone: '38998100827',
      name: 'Ana',
    });
  });

  it('ingesta mapeamento lidPnMappings do histórico', () => {
    const store = createWhatsAppContactStore();
    ingestWhatsAppPayload(store, {
      lidPnMappings: [{ lid: '53455246884964@lid', pn: '5538998100827@s.whatsapp.net' }],
    });
    expect(snapshotWhatsAppContacts(store).contacts[0]?.phone).toBe('38998100827');
  });

  it('ingesta remoteJidAlt das mensagens do histórico', () => {
    const store = createWhatsAppContactStore();
    ingestWhatsAppPayload(store, {
      messages: [
        {
          key: {
            remoteJid: '53455246884964@lid',
            remoteJidAlt: '5538998100827@s.whatsapp.net',
          },
          pushName: 'Ana',
        },
      ],
    });
    expect(snapshotWhatsAppContacts(store).contacts[0]).toEqual({
      phone: '38998100827',
      name: 'Ana',
    });
  });

  it('comando list-contacts não carrega texto de mensagem', () => {
    const command = { action: 'list-contacts' as const, accountId: 'acc', requestId: 'r1' };
    expect(command).not.toHaveProperty('body');
    expect(command).not.toHaveProperty('to');
    expect(command.action).not.toBe('send');
  });
});
