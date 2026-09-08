import { canImport, ForbiddenError, type SessionUser } from '@/lib/auth/rbac';
import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import {
  classifyWhatsAppImport,
  MAX_WHATSAPP_CONTACTS,
  phoneMatchVariants,
} from '@/lib/whatsapp/contacts';
import { requestWhatsAppContacts } from '@/lib/whatsapp/session-bus';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import {
  createManyLeads,
  fillLeadWhatsappIfEmpty,
  findLeadsByPhoneKeys,
} from '@/server/repositories/lead.repository';
import { findWhatsAppAccount } from '@/server/repositories/whatsapp.repository';
import { recordAudit } from '@/server/services/audit.service';

export type WhatsAppContactsImportResult = {
  readonly created: number;
  readonly matched: number;
  readonly skipped: number;
  readonly total: number;
};

export async function importWhatsAppContacts(
  user: SessionUser,
  accountId: string,
): Promise<WhatsAppContactsImportResult> {
  if (!canImport(user)) {
    throw new ForbiddenError('Importar contatos do WhatsApp é ação de gestor ou administrador.');
  }

  const account = await findWhatsAppAccount(accountId);
  if (!account) throw new NotFoundError('Conta WhatsApp não encontrada.');
  if (account.provider !== 'BAILEYS') {
    throw new BadRequestError('Só a conta WhatsApp Web (QR) importa a agenda.');
  }
  if (account.sessionStatus !== 'CONNECTED') {
    throw new BadRequestError('Conecte o WhatsApp antes de importar os contatos.');
  }

  const reply = await requestWhatsAppContacts(accountId);
  if (!reply.ok) {
    throw new BadRequestError(reply.error);
  }

  const contacts = reply.contacts.slice(0, MAX_WHATSAPP_CONTACTS);
  const emptyImportMessage =
    'Nenhum contato com telefone brasileiro nesta conta WhatsApp. Grupos não entram. Religue o container crm-worker, confirme a sessão Conectada e tente de novo.';
  if (contacts.length === 0) {
    throw new BadRequestError(emptyImportMessage);
  }

  const keys = [...new Set(contacts.flatMap((contact) => phoneMatchVariants(contact.phone)))];
  const existing = await findLeadsByPhoneKeys(keys);
  const plan = classifyWhatsAppImport(contacts, existing, reply.skipped);
  if (plan.create.length === 0 && plan.matched === 0) {
    throw new BadRequestError(emptyImportMessage);
  }

  for (const fill of plan.fillWhatsapp) {
    await fillLeadWhatsappIfEmpty(fill.id, fill.whatsapp);
  }

  const created = await createManyLeads(plan.create);

  await recordAudit({
    userId: user.id,
    action: 'whatsapp.contacts.import',
    entity: 'WhatsAppAccount',
    entityId: accountId,
    changes: {
      created,
      matched: plan.matched,
      skipped: plan.skipped,
      total: contacts.length,
    },
  });
  await notifyChange({
    type: 'whatsapp.contacts.import',
    tags: [...MUTATION_TAGS.leadsBulk, ...MUTATION_TAGS.whatsapp],
    entityId: accountId,
  });

  return {
    created,
    matched: plan.matched,
    skipped: plan.skipped,
    total: contacts.length,
  };
}
